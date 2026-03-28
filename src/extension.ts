import * as vscode from "vscode";
import { quickAdd } from "./quick-add";
import { pickTask } from "./pick-task";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("vscode-gtasks.quickAdd", quickAdd),
    vscode.commands.registerCommand("vscode-gtasks.pickTask", pickTask)
  );
}

export function deactivate(): void {}
