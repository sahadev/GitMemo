import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const logicUrl = new URL("../src/components/domain/editor/editorLogic.ts", import.meta.url);
const { outputText, diagnostics = [] } = ts.transpileModule(readFileSync(logicUrl, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
  reportDiagnostics: true,
});
const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
assert.deepEqual(errors, []);

const logicModuleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
const {
  applyMarkdownCommand,
  getEditorMode,
  isDarkEditorTheme,
  isMarkdownEditorPath,
} = await import(logicModuleUrl);

test("markdown mode is selected for supported document extensions", () => {
  assert.equal(isMarkdownEditorPath("notes/example.md"), true);
  assert.equal(isMarkdownEditorPath("rules/example.mdc"), true);
  assert.equal(isMarkdownEditorPath("README.markdown"), true);
  assert.equal(isMarkdownEditorPath("src/main.rs"), false);
  assert.equal(getEditorMode("notes/example.md"), "markdown");
  assert.equal(getEditorMode("src/main.rs"), "plain");
});

test("editor theme follows the application color theme", () => {
  assert.equal(isDarkEditorTheme("light"), false);
  assert.equal(isDarkEditorTheme("dark"), true);
});

test("inline commands preserve the selected content and place the cursor inside the markup", () => {
  const result = applyMarkdownCommand("hello world", { from: 6, to: 11 }, "bold");
  assert.equal(result.insert, "**world**");
  assert.deepEqual(result.selection, { from: 8, to: 13 });
});

test("line commands apply to every selected line", () => {
  const document = "first\nsecond";
  const result = applyMarkdownCommand(document, { from: 0, to: document.length }, "bulletList");
  assert.equal(result.insert, "- first\n- second");
  assert.deepEqual(result.selection, { from: 0, to: result.insert.length });
});

test("line commands keep a mid-line selection attached to its original text", () => {
  const result = applyMarkdownCommand("first line", { from: 6, to: 10 }, "quote");
  assert.equal(result.insert, "> first line");
  assert.deepEqual(result.selection, { from: 8, to: 12 });
});

test("block commands produce valid fenced Markdown", () => {
  const result = applyMarkdownCommand("const answer = 42", { from: 0, to: 18 }, "codeBlock");
  assert.equal(result.insert, "```\nconst answer = 42\n```");
  assert.deepEqual(result.selection, { from: 4, to: 21 });
});
