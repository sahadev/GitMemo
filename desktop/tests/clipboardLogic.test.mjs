import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const logicUrl = new URL("../src/components/domain/clipboard/clipboardLogic.ts", import.meta.url);
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
const { isCurrentClipLoadScope } = await import(logicModuleUrl);

test("only the latest request for the active clipboard filter may commit", () => {
  const current = { generation: 7, requestId: 12, filter: "text" };
  const generations = [6, 7];
  const requestIds = [11, 12];
  const filters = ["all", "text", "image"];

  for (const generation of generations) {
    for (const requestId of requestIds) {
      for (const filter of filters) {
        const scope = { generation, requestId, filter };
        const expected = generation === 7 && requestId === 12 && filter === "text";
        assert.equal(isCurrentClipLoadScope(scope, current), expected);
      }
    }
  }
});
