import * as vscode from "vscode";
import { findOrCreateTaskList, addTask } from "./gtasks-cli";

// ---------------------------------------------------------------------------
// Workspace helpers
// ---------------------------------------------------------------------------

function getWorkspaceName(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0].name;
}

const MAX_SELECTION_LINES = 30;
const MAX_SELECTION_CHARS = 1000;

function dedent(text: string): string {
  const lines = text.split("\n");
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length === 0) {
    return text;
  }
  const minIndent = Math.min(
    ...nonEmptyLines.map((l) => l.match(/^(\s*)/)?.[1].length ?? 0)
  );
  if (minIndent === 0) {
    return text;
  }
  return lines.map((l) => l.slice(minIndent)).join("\n");
}

function getSelectionContext(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }
  const selection = editor.selection;
  if (selection.isEmpty) {
    return undefined;
  }
  const selectedText = editor.document.getText(selection);
  if (!selectedText.trim()) {
    return undefined;
  }

  const lineCount = selection.end.line - selection.start.line + 1;
  if (lineCount > MAX_SELECTION_LINES) {
    return undefined;
  }

  const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
  const startLine = selection.start.line + 1;
  const endLine = selection.end.line + 1;
  const lineRef =
    startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;

  const dedented = dedent(selectedText);
  const truncated =
    dedented.length > MAX_SELECTION_CHARS
      ? `${dedented.slice(0, MAX_SELECTION_CHARS)}...`
      : dedented;

  return `${relativePath}:${lineRef}\n${truncated}`;
}

// ---------------------------------------------------------------------------
// @tag parsing
// ---------------------------------------------------------------------------

// Matches: @next, @today, @tomorrow, @3d, @3day, @3days, @2w, @2week, @2weeks
const TAG_RE = /@(next|today|tomorrow|(\d+)(d|day|days|w|week|weeks))\b/gi;

interface ParsedTags {
  insertAtTop: boolean;
  due: string | undefined;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toRfc3339Date(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}T00:00:00.000Z`;
}

function parseTags(input: string): { cleaned: string; tags: ParsedTags } {
  const tags: ParsedTags = { insertAtTop: false, due: undefined };
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cleaned = input.replace(TAG_RE, (_match, tag, num, unit) => {
    const tagLower = tag.toLowerCase();

    if (tagLower === "next") {
      tags.insertAtTop = true;
      return "";
    }
    if (tagLower === "today") {
      tags.due = toRfc3339Date(today);
      return "";
    }
    if (tagLower === "tomorrow") {
      tags.due = toRfc3339Date(addDays(today, 1));
      return "";
    }

    // Relative: @3d, @2w, etc.
    const n = parseInt(num, 10);
    if (unit === "d" || unit === "day" || unit === "days") {
      tags.due = toRfc3339Date(addDays(today, n));
    } else if (unit === "w" || unit === "week" || unit === "weeks") {
      tags.due = toRfc3339Date(addDays(today, n * 7));
    }
    return "";
  });

  return { cleaned: cleaned.replace(/\s{2,}/g, " ").trim(), tags };
}

// ---------------------------------------------------------------------------
// Quick add command
// ---------------------------------------------------------------------------

export async function quickAdd(): Promise<void> {
  const workspaceName = getWorkspaceName();
  if (!workspaceName) {
    vscode.window.showErrorMessage("GTasks: Open a workspace first.");
    return;
  }

  const raw = await vscode.window.showInputBox({
    prompt: `Add task to [${workspaceName}] — @next @today @tomorrow @3d @2w`,
    placeHolder: "Task title...",
  });

  if (!raw) {
    return;
  }

  try {
    const { cleaned: title, tags } = parseTags(raw);
    if (!title) {
      vscode.window.showWarningMessage("GTasks: Empty task title.");
      return;
    }

    // Second input box: optional details
    const userDetails = await vscode.window.showInputBox({
      prompt: "Details (optional, Esc to skip)",
      placeHolder: "Notes, context, description...",
    });

    // Build notes: user details + selection context
    const selectionContext = getSelectionContext();
    const notesParts: string[] = [];
    if (userDetails) {
      notesParts.push(userDetails);
    }
    if (selectionContext) {
      notesParts.push(selectionContext);
    }
    const notes = notesParts.length > 0 ? notesParts.join("\n\n") : undefined;

    const listId = await findOrCreateTaskList(workspaceName);
    await addTask({
      listId,
      title,
      notes,
      due: tags.due,
      insertAtTop: tags.insertAtTop,
    });

    const extras: string[] = [];
    if (tags.due) {
      extras.push(`due: ${tags.due.split("T")[0]}`);
    }
    if (tags.insertAtTop) {
      extras.push("top");
    }
    const suffix = extras.length > 0 ? ` (${extras.join(", ")})` : "";
    vscode.window.setStatusBarMessage(
      `Task added to ${workspaceName}${suffix}`,
      5000
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`GTasks: ${message}`);
  }
}
