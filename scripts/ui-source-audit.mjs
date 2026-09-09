// Source inventory, not a substitute for browser or assistive-technology testing.
// Run from frontend: node scripts/ui-source-audit.mjs
import ts from "typescript";
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const files = readdirSync("src", { recursive: true }).filter((file) => file.endsWith(".tsx")).sort();
const result = { generatedAt: new Date().toISOString(), routes: [], components: [], totals: {} };
for (const file of files) {
  const source = readFileSync("src/" + file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const entry = { file, route: file.endsWith("/page.tsx") ? "/" + file.replace(/^app\//, "").replace(/\/?page\.tsx$/, "") : null, headings: 0, tables: 0, nativeSelects: 0, customSelects: 0, dialogs: 0, legacyOverlays: [], unnamedControls: [], browserPrompts: [], errorSignals: /(?:role="alert"|setError|toast\.error|reportError)/.test(source), loadingSignals: /(?:loading|busy|Loading|Suspense)/.test(source), emptySignals: /(?:No |no |empty|\.length === 0|!\w+\.length)/.test(source) };
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(ast);
      const attrs = new Map(node.attributes.properties.filter(ts.isJsxAttribute).map((a) => [a.name.getText(ast), a.initializer?.getText(ast) || ""]));
      const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      if (tag === "h1") entry.headings++;
      if (tag === "table") entry.tables++;
      if (["select", "FormSelect"].includes(tag)) entry.nativeSelects++;
      if (tag === "AppSelect") entry.customSelects++;
      if (["Dialog", "dialog"].includes(tag)) entry.dialogs++;
      if (/fixed inset-0/.test(attrs.get("className") || "") && tag !== "button") entry.legacyOverlays.push(line);
      if (["input", "select", "FormSelect", "textarea", "button"].includes(tag)) {
        let labelled = ["aria-label", "aria-labelledby", "title", "id"].some((key) => attrs.has(key));
        let parent = node.parent;
        while (parent && !ts.isSourceFile(parent)) {
          if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(ast) === "label") labelled = true;
          parent = parent.parent;
        }
        const spread = node.attributes.properties.some(ts.isJsxSpreadAttribute);
        const hidden = attrs.get("type") === '"hidden"';
        const text = tag === "button" && ts.isJsxElement(node.parent) && node.parent.children.some((child) => ts.isJsxExpression(child) || (ts.isJsxText(child) && child.text.trim()));
        if (!labelled && !spread && !hidden && !text) entry.unnamedControls.push({ tag, line });
      }
    }
    if (ts.isCallExpression(node) && /^(?:window\.)?(?:alert|confirm|prompt)$/.test(node.expression.getText(ast))) entry.browserPrompts.push(ast.getLineAndCharacterOfPosition(node.pos).line + 1);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  (entry.route !== null ? result.routes : result.components).push(entry);
}
const all = [...result.routes, ...result.components];
result.totals = {
  routes: result.routes.length, tsxFiles: files.length,
  tables: all.reduce((sum, e) => sum + e.tables, 0),
  nativeSelects: all.reduce((sum, e) => sum + e.nativeSelects, 0),
  customSelects: all.reduce((sum, e) => sum + e.customSelects, 0),
  legacyOverlays: all.reduce((sum, e) => sum + e.legacyOverlays.length, 0),
  controlsToReview: all.reduce((sum, e) => sum + e.unnamedControls.length, 0),
  browserPromptCalls: all.reduce((sum, e) => sum + e.browserPrompts.length, 0),
};
const out = process.env.UI_AUDIT_OUTPUT || "/tmp/superstore-ui-audit-results";
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "source-inventory.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.totals, null, 2));
console.log("Heuristic candidates require manual verification; file-local scans cannot resolve composed components.");
console.log("Inventory:", resolve(out, "source-inventory.json"));
