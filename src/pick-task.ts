import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  findOrCreateTaskList,
  listTasks,
  updateTaskNotes,
  type TaskEntry,
} from "./gtasks-cli";

// ---------------------------------------------------------------------------
// Session ID marker: s[<sessionId>] embedded in task notes
// ---------------------------------------------------------------------------

const SESSION_RE = /s\[([^\]]+)\]/;

function extractSessionId(notes: string): string | undefined {
  return SESSION_RE.exec(notes)?.[1];
}

function stripSessionMarker(notes: string): string {
  return notes.replace(SESSION_RE, "").trim();
}

function addSessionMarker(notes: string, sessionId: string): string {
  const stripped = stripSessionMarker(notes);
  return stripped ? `${stripped}\n\ns[${sessionId}]` : `s[${sessionId}]`;
}

// ---------------------------------------------------------------------------
// Find the newest session ID from project JSONL files
// ---------------------------------------------------------------------------

function findNewestSessionId(): string | undefined {
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!cwd) {
    return undefined;
  }

  // Claude stores sessions in ~/.claude/projects/<encoded-path>/
  const encodedPath = cwd.replace(/\//g, "-");
  const sessionsDir = path.join(os.homedir(), ".claude", "projects", encodedPath);

  let files: string[];
  try {
    files = fs.readdirSync(sessionsDir);
  } catch {
    return undefined;
  }

  const jsonlFiles = files
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (jsonlFiles.length === 0) {
    return undefined;
  }

  return jsonlFiles[0].name.replace(".jsonl", "");
}

// ---------------------------------------------------------------------------
// Pick task command
// ---------------------------------------------------------------------------

function getWorkspaceName(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0].name;
}

export async function pickTask(): Promise<void> {
  const workspaceName = getWorkspaceName();
  if (!workspaceName) {
    vscode.window.showErrorMessage("GTasks: Open a workspace first.");
    return;
  }

  let listId: string;
  try {
    listId = await findOrCreateTaskList(workspaceName);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`GTasks: ${message}`);
    return;
  }

  let tasks: TaskEntry[];
  try {
    tasks = await listTasks(listId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`GTasks: ${message}`);
    return;
  }

  if (tasks.length === 0) {
    vscode.window.showInformationMessage(
      `GTasks: No tasks in [${workspaceName}].`
    );
    return;
  }

  // Build QuickPick items
  const items = tasks.map((task) => {
    const dueLabel = task.due ? ` — due ${task.due.split("T")[0]}` : "";
    const hasSession = task.notes ? SESSION_RE.test(task.notes) : false;
    const sessionIcon = hasSession ? "$(debug-continue) " : "";
    return {
      label: `${sessionIcon}${task.title}${dueLabel}`,
      description: hasSession ? "resume session" : "new session",
      task,
    };
  });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Pick a task from [${workspaceName}]`,
  });

  if (!picked) {
    return;
  }

  const { task } = picked;
  const existingSessionId = task.notes
    ? extractSessionId(task.notes)
    : undefined;

  if (existingSessionId) {
    // Resume existing Claude session
    await vscode.commands.executeCommand(
      "claude-vscode.editor.open",
      existingSessionId
    );
    return;
  }

  // Build prompt from task title + details (without session marker)
  const cleanNotes = task.notes ? stripSessionMarker(task.notes) : "";
  const promptParts = [task.title];
  if (cleanNotes) {
    promptParts.push(cleanNotes);
  }
  const prompt = promptParts.join("\n\n");

  // Snapshot session list before opening
  const sessionBefore = findNewestSessionId();

  // Open new Claude session with the task as initial prompt
  await vscode.commands.executeCommand(
    "claude-vscode.editor.open",
    undefined,
    prompt
  );

  // Poll for the new session file (max 5 seconds)
  let newSessionId: string | undefined;
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    newSessionId = findNewestSessionId();
    if (newSessionId && newSessionId !== sessionBefore) {
      break;
    }
    newSessionId = undefined;
  }

  if (newSessionId) {
    // Write session ID back to task notes
    try {
      const updatedNotes = addSessionMarker(task.notes ?? "", newSessionId);
      await updateTaskNotes(listId, task.id, updatedNotes);
    } catch {
      // Non-critical: session tracking failed, but the Claude tab is open
    }
  }
}
