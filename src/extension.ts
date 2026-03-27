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
