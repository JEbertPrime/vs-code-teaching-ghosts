import * as path from 'path';
import * as vscode from 'vscode';
import { DirectionDiagnostic, DirectionRequest } from './types';

export interface DirectionRequestOptions {
  sendFullFileContext: boolean;
  maxContextLines: number;
  maxSuggestionLength: number;
}

export function buildDirectionRequest(
  document: vscode.TextDocument,
  position: vscode.Position,
  options: DirectionRequestOptions
): DirectionRequest {
  const line = document.lineAt(position.line).text;
  const contextWindow = getContextWindow(document, position, options);

  return {
    languageId: document.languageId,
    fileName: getSafeFileName(document),
    relativeFilePath: getRelativeFilePath(document),
    lineNumber: position.line,
    lineText: line,
    prefixText: line.slice(0, position.character),
    documentText: getDocumentText(document, options),
    contextBefore: contextWindow.before,
    contextAfter: contextWindow.after,
    diagnostics: getNearbyDiagnostics(document, position),
    maxSuggestionLength: options.maxSuggestionLength
  };
}

function getContextWindow(
  document: vscode.TextDocument,
  position: vscode.Position,
  options: DirectionRequestOptions
): { before: string; after: string } {
  if (options.sendFullFileContext) {
    return {
      before: getLines(document, 0, position.line),
      after: getLines(document, position.line + 1, document.lineCount)
    };
  }

  const maxLines = Math.max(0, Math.floor(options.maxContextLines));
  const beforeBudget = Math.ceil(maxLines / 2);
  const afterBudget = Math.floor(maxLines / 2);
  const start = Math.max(0, position.line - beforeBudget);
  const end = Math.min(document.lineCount, position.line + afterBudget + 1);

  return {
    before: getLines(document, start, position.line),
    after: getLines(document, position.line + 1, end)
  };
}

function getDocumentText(document: vscode.TextDocument, options: DirectionRequestOptions): string {
  if (options.sendFullFileContext) {
    return document.getText();
  }

  const maxLines = Math.max(1, Math.floor(options.maxContextLines));
  return getLines(document, 0, Math.min(document.lineCount, maxLines));
}

function getLines(document: vscode.TextDocument, startLine: number, endLineExclusive: number): string {
  const lines: string[] = [];
  for (let index = startLine; index < endLineExclusive; index += 1) {
    lines.push(document.lineAt(index).text);
  }

  return lines.join('\n');
}

function getSafeFileName(document: vscode.TextDocument): string {
  if (document.uri.scheme !== 'file') {
    return document.uri.path.split('/').pop() || 'Untitled';
  }

  return path.basename(document.fileName);
}

function getRelativeFilePath(document: vscode.TextDocument): string {
  if (document.uri.scheme !== 'file') {
    return getSafeFileName(document);
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return getSafeFileName(document);
  }

  return path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath) || getSafeFileName(document);
}

function getNearbyDiagnostics(document: vscode.TextDocument, position: vscode.Position): DirectionDiagnostic[] {
  const startLine = Math.max(0, position.line - 8);
  const endLine = Math.min(document.lineCount - 1, position.line + 8);

  return vscode.languages
    .getDiagnostics(document.uri)
    .filter(diagnostic => diagnostic.range.start.line <= endLine && diagnostic.range.end.line >= startLine)
    .slice(0, 5)
    .map(diagnostic => ({
      severity: toSeverityName(diagnostic.severity),
      message: diagnostic.message.replace(/\s+/g, ' ').slice(0, 180),
      lineNumber: diagnostic.range.start.line
    }));
}

function toSeverityName(severity: vscode.DiagnosticSeverity): DirectionDiagnostic['severity'] {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return 'error';
    case vscode.DiagnosticSeverity.Warning:
      return 'warning';
    case vscode.DiagnosticSeverity.Information:
      return 'info';
    case vscode.DiagnosticSeverity.Hint:
    default:
      return 'hint';
  }
}
