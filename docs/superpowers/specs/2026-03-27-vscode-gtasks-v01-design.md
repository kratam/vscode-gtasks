# vscode-gtasks v0.1 Design

## Overview

VSCode extension for quick task capture into Google Tasks, using the `gtasks` CLI as backend. Workspace name determines which Google Tasks list receives the task.

## Architecture

```
User → Cmd+Shift+G → VSCode InputBox → extension → gtasks CLI → Google Tasks API
```

Three source files:

- **extension.ts** — `activate()` registers the `vscode-gtasks.quickAdd` command. Deactivate is no-op.
- **gtasks-cli.ts** — Thin wrapper around `gtasks` binary via `child_process.execFile`. Exposes: `listTaskLists()`, `createTaskList(name)`, `addTask(list, title, notes?)`. Parses CLI stdout. Detects missing binary and missing login.
- **quick-add.ts** — Implements the quick-add command: gets workspace name, shows input box, resolves/creates task list, adds task with optional selection context, shows status bar message.

## CLI Integration

The `gtasks` CLI (Go binary at `~/.local/bin/gtasks`) handles OAuth2 auth and token refresh. The extension calls it as a subprocess via `execFile` (not `exec`, to prevent shell injection).

| Operation | Command |
|-----------|---------|
| List task lists | `gtasks tasklists view` (parse `[N] Name` lines) |
| Create task list | `gtasks tasklists add -t "Name"` |
| Add task | `gtasks tasks add -l "List" -t "Title" -n "Notes"` |
| View tasks | `gtasks tasks view -l "List" --format json` |

## UX Flow

1. User presses `Cmd+Shift+G` (macOS) / `Ctrl+Shift+G` (Win/Linux)
2. Input box appears: "Add task to [WorkspaceName]..."
3. User types task title, presses Enter
4. Extension finds or creates the matching task list
5. Creates the task (with selection context in notes if present)
6. Shows "Task added to [WorkspaceName]" in status bar (5 seconds)

## Selection Context

If the user has text selected when invoking quick-add, the task notes include:

```
Context: src/example.ts:42
<selected text, max 500 chars>
```

## Error Handling

| Condition | Behavior |
|-----------|----------|
| `gtasks` binary not found | Error message: "gtasks CLI not found. Install: https://gtasks.sidv.dev/install" |
| Not logged in (CLI returns auth error) | Error message with "Run `gtasks login` in terminal" |
| Network/API error | Error notification with CLI stderr |
| No workspace open | Error: "Open a workspace first" |

## Package Manifest (package.json)

- **Command:** `vscode-gtasks.quickAdd` — "GTasks: Quick Add Task"
- **Keybinding:** `Cmd+Shift+G` / `Ctrl+Shift+G`
- **Activation:** `onCommand:vscode-gtasks.quickAdd`
- **Engine:** `^1.85.0`

## Build

- esbuild for bundling
- TypeScript strict mode
- No runtime dependencies (only `@types/vscode` and `esbuild` as dev deps)

## Out of Scope (v0.1)

- Tree view / sidebar
- Task completion/deletion from VSCode
- Due dates, priorities, sub-tasks
- Multi-workspace / monorepo support
- Marketplace publishing
