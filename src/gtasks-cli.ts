import { execFile } from "node:child_process";
import * as https from "node:https";

const TASKS_API_BASE = "www.googleapis.com";

// ---------------------------------------------------------------------------
// OAuth2 token management — reads from macOS keychain (shared with gtasks CLI)
// ---------------------------------------------------------------------------

interface TokenData {
  access_token: string;
  refresh_token: string;
  expiry: string;
}

let cachedToken: TokenData | undefined;

function readTokenFromKeychain(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "security",
      ["find-generic-password", "-s", "gtasks", "-a", "oauth2-token", "-w"],
      (error, stdout) => {
        if (error) {
          reject(
            new Error(
              "Cannot read gtasks token from keychain. Run `gtasks login` first."
            )
          );
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

function parseKeychainToken(raw: string): TokenData {
  const json = raw.startsWith("go-keyring-base64:")
    ? Buffer.from(raw.slice("go-keyring-base64:".length), "base64").toString()
    : raw;
  return JSON.parse(json) as TokenData;
}

async function refreshAccessToken(token: TokenData): Promise<TokenData> {
  const configRaw = await new Promise<string>((resolve, reject) => {
    const fs = require("node:fs");
    fs.readFile(
      `${process.env.HOME}/.config/gtasks/config.toml`,
      "utf-8",
      (err: Error | null, data: string) => (err ? reject(err) : resolve(data))
    );
  });

  const clientId =
    configRaw.match(/client_id\s*=\s*"([^"]+)"/)?.[1] ?? "";
  const clientSecret =
    configRaw.match(/client_secret\s*=\s*"([^"]+)"/)?.[1] ?? "";

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: token.refresh_token,
    grant_type: "refresh_token",
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "oauth2.googleapis.com",
        path: "/token",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Token refresh failed: ${data}`));
            return;
          }
          const parsed = JSON.parse(data);
          const refreshed: TokenData = {
            access_token: parsed.access_token,
            refresh_token: token.refresh_token,
            expiry: new Date(
              Date.now() + (parsed.expires_in ?? 3600) * 1000
            ).toISOString(),
          };
          cachedToken = refreshed;
          resolve(refreshed);
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function getAccessToken(): Promise<string> {
  if (!cachedToken) {
    const raw = await readTokenFromKeychain();
    cachedToken = parseKeychainToken(raw);
  }

  const expiry = new Date(cachedToken.expiry).getTime();
  if (Date.now() > expiry - 60_000) {
    cachedToken = await refreshAccessToken(cachedToken);
  }

  return cachedToken.access_token;
}

// ---------------------------------------------------------------------------
// Google Tasks REST API helpers
// ---------------------------------------------------------------------------

interface ApiResponse {
  statusCode: number;
  body: string;
}

function apiRequest(
  method: string,
  path: string,
  accessToken: string,
  body?: string
): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: TASKS_API_BASE,
        path,
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(body
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () =>
          resolve({ statusCode: res.statusCode ?? 0, body: data })
        );
      }
    );
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface TaskListEntry {
  id: string;
  title: string;
}

export async function listTaskLists(): Promise<TaskListEntry[]> {
  const token = await getAccessToken();
  const res = await apiRequest(
    "GET",
    "/tasks/v1/users/@me/lists?maxResults=100",
    token
  );
  if (res.statusCode !== 200) {
    throw new Error(`Failed to list task lists: ${res.body}`);
  }
  const parsed = JSON.parse(res.body);
  return (parsed.items ?? []).map((item: { id: string; title: string }) => ({
    id: item.id,
    title: item.title,
  }));
}

export async function createTaskList(name: string): Promise<string> {
  const token = await getAccessToken();
  const res = await apiRequest(
    "POST",
    "/tasks/v1/users/@me/lists",
    token,
    JSON.stringify({ title: name })
  );
  if (res.statusCode !== 200) {
    throw new Error(`Failed to create task list: ${res.body}`);
  }
  return JSON.parse(res.body).id as string;
}

export async function findOrCreateTaskList(name: string): Promise<string> {
  const lists = await listTaskLists();
  const existing = lists.find((l) => l.title === name);
  if (existing) {
    return existing.id;
  }
  return createTaskList(name);
}

interface AddTaskOptions {
  listId: string;
  title: string;
  notes?: string;
  due?: string; // RFC 3339 date string
  insertAtTop?: boolean;
}

export async function addTask(options: AddTaskOptions): Promise<void> {
  const token = await getAccessToken();

  const taskBody: Record<string, string> = { title: options.title };
  if (options.notes) {
    taskBody.notes = options.notes;
  }
  if (options.due) {
    taskBody.due = options.due;
  }

  // Default: insert at end. @next: insert at top (previous='' means first position).
  let path = `/tasks/v1/lists/${encodeURIComponent(options.listId)}/tasks`;
  if (options.insertAtTop) {
    // Omitting 'previous' parameter inserts at the top (Google Tasks API default)
  } else {
    // To insert at the end, we need the last task's ID as 'previous'
    const lastTaskId = await getLastTaskId(options.listId, token);
    if (lastTaskId) {
      path += `?previous=${encodeURIComponent(lastTaskId)}`;
    }
  }

  const res = await apiRequest("POST", path, token, JSON.stringify(taskBody));
  if (res.statusCode !== 200) {
    throw new Error(`Failed to add task: ${res.body}`);
  }
}

async function getLastTaskId(
  listId: string,
  token: string
): Promise<string | undefined> {
  const res = await apiRequest(
    "GET",
    `/tasks/v1/lists/${encodeURIComponent(listId)}/tasks?maxResults=100&showCompleted=false`,
    token
  );
  if (res.statusCode !== 200) {
    return undefined;
  }
  const parsed = JSON.parse(res.body);
  const items = parsed.items as { id: string }[] | undefined;
  if (!items || items.length === 0) {
    return undefined;
  }
  return items[items.length - 1].id;
}
