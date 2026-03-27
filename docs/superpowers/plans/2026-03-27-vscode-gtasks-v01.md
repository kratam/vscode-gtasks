# vscode-gtasks v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VSCode extension for quick task capture into Google Tasks via the `gtasks` CLI.

**Architecture:** Three-file extension: `gtasks-cli.ts` wraps the `gtasks` binary via `execFile`, `quick-add.ts` handles the input box UX and workspace-to-list mapping, `extension.ts` wires commands. No OAuth2 — delegates auth to the CLI.

**Tech Stack:** TypeScript, VSCode Extension API, esbuild, `gtasks` CLI (Go binary)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `package.json` | Extension manifest: commands, keybindings, activation events |
| `tsconfig.json` | TypeScript config (strict, ES2020, bundler module resolution) |
| `esbuild.js` | Build script for bundling the extension |
| `.vscodeignore` | Exclude source files from packaged extension |
| `src/extension.ts` | `activate()` registers quickAdd command; `deactivate()` is no-op |
| `src/gtasks-cli.ts` | Wraps `gtasks` binary: `listTaskLists()`, `createTaskList()`, `addTask()` |
| `src/quick-add.ts` | Quick add command: input box, find/create list, add task, status bar feedback |

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.js`
- Create: `.vscodeignore`
- Create: `src/extension.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "vscode-gtasks",
  "displayName": "GTasks Quick Add",
  "description": "Quick task capture into Google Tasks with workspace-based lists",
  "version": "0.1.0",
  "publisher": "kratam",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "activationEvents": [],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "vscode-gtasks.quickAdd",
        "title": "GTasks: Quick Add Task"
      }
    ],
    "keybindings": [
      {
        "command": "vscode-gtasks.quickAdd",
        "key": "ctrl+shift+g",
        "mac": "cmd+shift+g"
      }
    ]
  },
  "scripts": {
    "build": "node esbuild.js",
    "watch": "node esbuild.js --watch",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "esbuild": "^0.20.0",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create esbuild.js**

```javascript
const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
};

if (watch) {
  esbuild.context(buildOptions).then((ctx) => {
    ctx.watch();
    console.log("Watching for changes...");
  });
} else {
  esbuild.build(buildOptions).then(() => {
    console.log("Build complete");
  });
}
```

- [ ] **Step 4: Create .vscodeignore**

```
src/
node_modules/
tsconfig.json
esbuild.js
docs/
```

- [ ] **Step 5: Create minimal src/extension.ts**

```typescript
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    "vscode-gtasks.quickAdd",
    () => {
      vscode.window.showInformationMessage("GTasks: not yet implemented");
    }
  );
  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
```

- [ ] **Step 6: Install dependencies and verify build**

Run: `cd /Users/kratam/dev/tools/vscode-gtasks && npm install && npm run build`
Expected: `dist/extension.js` created with no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json esbuild.js .vscodeignore src/extension.ts package-lock.json
git commit -m "feat: project scaffold with minimal extension"
```

---

### Task 2: gtasks CLI Wrapper

**Files:**
- Create: `src/gtasks-cli.ts`

- [ ] **Step 1: Create src/gtasks-cli.ts**

The `gtasks tasklists view` command outputs lines like `[1] Work`, `[2] Personal`. Parse these with a regex. The `gtasks tasks add` command uses `-l`, `-t`, `-n` flags. All calls use `node:child_process.execFile` (not `exec`) to prevent shell injection.

```typescript
import { execFile } from "node:child_process";

const GTASKS_BIN = "gtasks";

interface ExecResult {
  stdout: string;
  stderr: string;
}

function run(args: string[]): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(GTASKS_BIN, args, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        const msg = stderr.trim() || error.message;
        if (
          msg.includes("executable file not found") ||
          msg.includes("ENOENT")
        ) {
          reject(
            new Error(
              "gtasks CLI not found. Install: curl -fsSL https://gtasks.sidv.dev/install | bash"
            )
          );
          return;
        }
        if (
          msg.includes("login") ||
          msg.includes("auth") ||
          msg.includes("token")
        ) {
          reject(
            new Error(
              "Not logged in to gtasks. Run `gtasks login` in your terminal first."
            )
          );
          return;
        }
        reject(new Error(`gtasks error: ${msg}`));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

const LIST_LINE_RE = /^\[(\d+)\]\s+(.+)$/;

export async function listTaskLists(): Promise<string[]> {
  const { stdout } = await run(["tasklists", "view"]);
  if (!stdout) {
    return [];
  }
  return stdout
    .split("\n")
    .map((line) => LIST_LINE_RE.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[2]);
}

export async function createTaskList(name: string): Promise<void> {
  await run(["tasklists", "add", "-t", name]);
}

export async function addTask(
  list: string,
  title: string,
  notes?: string
): Promise<void> {
  const args = ["tasks", "add", "-l", list, "-t", title];
  if (notes) {
    args.push("-n", notes);
  }
  await run(args);
}
```

- [ ] **Step 2: Verify build compiles**

Run: `cd /Users/kratam/dev/tools/vscode-gtasks && npm run build`
Expected: Build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/gtasks-cli.ts
git commit -m "feat: gtasks CLI wrapper with execFile"
```

---

### Task 3: Quick Add Command

**Files:**
- Create: `src/quick-add.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Create src/quick-add.ts**

```typescript
import * as vscode from "vscode";
import { listTaskLists, createTaskList, addTask } from "./gtasks-cli";

function getWorkspaceName(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0].name;
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
  const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
  const line = selection.start.line + 1;
  const truncated =
    selectedText.length > 500
      ? selectedText.slice(0, 500) + "..."
      : selectedText;
  return `Context: ${relativePath}:${line}\n${truncated}`;
}

async function ensureTaskList(name: string): Promise<void> {
  const lists = await listTaskLists();
  if (!lists.includes(name)) {
    await createTaskList(name);
  }
}

export async function quickAdd(): Promise<void> {
  const workspaceName = getWorkspaceName();
  if (!workspaceName) {
    vscode.window.showErrorMessage("GTasks: Open a workspace first.");
    return;
  }

  const title = await vscode.window.showInputBox({
    prompt: `Add task to [${workspaceName}]`,
    placeHolder: "Task title...",
  });

  if (!title) {
    return;
  }

  try {
    await ensureTaskList(workspaceName);
    const notes = getSelectionContext();
    await addTask(workspaceName, title, notes);
    vscode.window.setStatusBarMessage(`Task added to ${workspaceName}`, 5000);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`GTasks: ${message}`);
  }
}
```

- [ ] **Step 2: Update src/extension.ts to use quickAdd**

Replace the entire file with:

```typescript
import * as vscode from "vscode";
import { quickAdd } from "./quick-add";

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    "vscode-gtasks.quickAdd",
    quickAdd
  );
  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
```

- [ ] **Step 3: Build and verify**

Run: `cd /Users/kratam/dev/tools/vscode-gtasks && npm run build`
Expected: Build succeeds, `dist/extension.js` updated.

- [ ] **Step 4: Commit**

```bash
git add src/quick-add.ts src/extension.ts
git commit -m "feat: quick add command with workspace-based task lists"
```

---

### Task 4: Manual Test

- [ ] **Step 1: Test the extension in VSCode**

1. Open the `vscode-gtasks` folder in VSCode
2. Press `F5` to launch Extension Development Host
3. In the new window, open any workspace folder
4. Press `Cmd+Shift+G`
5. Type a test task title, press Enter
6. Verify: status bar shows "Task added to [WorkspaceName]"
7. Verify: `gtasks tasks view -l "WorkspaceName" --format json` shows the task

- [ ] **Step 2: Test with selected text**

1. Select some code in a file
2. Press `Cmd+Shift+G`
3. Type a task title, press Enter
4. Verify: `gtasks tasks view -l "WorkspaceName" --format json` shows the task with context note

- [ ] **Step 3: Test error cases**

1. Close all workspaces, trigger command via Command Palette → should show "Open a workspace first"
2. (Optional) Temporarily rename gtasks binary → should show install message

- [ ] **Step 4: Clean up test tasks and commit fixes if needed**

```bash
git add -u
git commit -m "fix: adjustments from manual testing"
```
