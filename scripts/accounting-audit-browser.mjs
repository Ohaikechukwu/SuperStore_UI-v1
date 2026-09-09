// Local-only browser regression checks. All API traffic uses synthetic fixtures.
// UI_AUDIT_TOOLS=/tmp/superstore-ui-audit/node_modules node scripts/accounting-audit-browser.mjs
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const require = createRequire(resolve(process.env.UI_AUDIT_TOOLS || "/tmp/superstore-ui-audit/node_modules", "package.json"));
const { chromium } = require("playwright-core");
const { default: AxeBuilder } = require("@axe-core/playwright");
const base = process.env.UI_AUDIT_URL || "http://localhost:3015";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = "/tmp/superstore-accounting-audit";
mkdirSync(output, { recursive: true });
const permissions = ["accounting.read", "accounting.manage", "accounting.post", "accounting.approve", "accounting.period.manage", "accounting.payables.manage", "accounting.receivables.manage", "reports.read"];
let readOnly = false;
let failReports = false;
let writeCount = 0;
const reportRequests = [];
const runtimeErrors = [];
const results = [];
const accounts = [
  ["cash", "1000", "Cash on hand", "asset", true, true],
  ["stock", "1200", "Inventory control", "asset", false, false],
  ["ap", "2000", "Accounts payable", "liability", false, false],
  ["equity", "3000", "Owner capital", "equity", true, false],
  ["income", "4000", "Sales income", "income", true, false],
  ["expense", "5100", "Operating expenses", "expense", true, false],
].map(([id, code, name, account_type, allow_manual_posting, settlement_allowed]) => ({ id, code, name, account_type, active: true, allow_manual_posting, settlement_allowed }));
const periods = [{ id: "period", name: "FY 2026", starts_on: "2026-01-01", ends_on: "2026-12-31", status: "open" }];
const journals = [
  { id: "pending", description: "Office expense adjustment", reference_type: "manual", approval_status: "pending", posted: false, created_by_user_id: "another-user" },
  { id: "own", description: "My adjustment", reference_type: "manual", approval_status: "pending", posted: false, created_by_user_id: "audit-user" },
  { id: "sale", description: "POS sale receipt", reference_type: "sale", approval_status: "approved", posted: true, created_by_user_id: "another-user" },
].map(j => ({ ...j, reference_id: j.id, entry_date: "2026-09-03", created_at: "2026-09-03T12:00:00Z", reversed_by_id: null, reversal_of_id: null }));
const auth = () => ({ user_id: "audit-user", tenant_id: "audit-tenant", role: "owner", branch_ids: [], permissions: readOnly ? ["accounting.read"] : permissions, denied_permissions: [], licensed_modules: ["store", "stock", "accounting"], attributes: {}, membership_attributes: {}, policies: [] });
const balances = [{ account_id: "cash", code: "1000", name: "Cash on hand", account_type: "asset", balance: "80.00", debit: "80.00", credit: "0.00" }, { account_id: "income", code: "4000", name: "Sales income", account_type: "income", balance: "-80.00", debit: "0.00", credit: "80.00" }];
const fs = { profit_and_loss: { income: [{ ...balances[1], balance: "80.00" }], expenses: [], total_income: "80.00", total_expenses: "0.00", net_profit: "80.00" }, balance_sheet: { assets: [balances[0]], liabilities: [], equity: [], total_assets: "80.00", total_liabilities: "0.00", total_equity: "80.00", unclosed_earnings: "80.00", balanced: true, difference: "0.00" }, cash_movement: { opening: "100.00", net_change: "-20.00", closing: "80.00", basis: "System cash and settlement clearing accounts; not a statutory cash-flow statement" } };
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
await context.route("**/*", async route => {
  const req = route.request(), url = new URL(req.url()), path = url.pathname.replace(/^.*(?=\/api\/v1\/)/, "");
  if (!path.includes("/api/v1/") && !path.includes("/health/")) return url.origin === new URL(base).origin ? route.continue() : route.abort();
  let body = [], status = 200;
  if (path.endsWith("/auth/refresh")) body = { access_token: "synthetic-token", token_type: "bearer" };
  else if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) {
    writeCount++;
    await new Promise(resolve => setTimeout(resolve, 600));
    status = 422; body = { detail: "Fixture rejection: confirm the supporting reference." };
  } else if (path.endsWith("/auth/me/authorization")) body = auth();
  else if (path.endsWith("/auth/me")) body = { ...auth(), email: "audit@example.test", full_name: "Accounting reviewer" };
  else if (path.endsWith("/catalog/tenant/settings") || path.endsWith("/catalog/tenant/resolve")) body = { name: "Audit workspace", currency: "NGN", settings: { timezone: "Africa/Lagos", brand_name: "Audit workspace", enabled_modules: auth().licensed_modules, licensed_modules: auth().licensed_modules, feature_flags: {} } };
  else if (path.endsWith("/accounting/accounts")) body = accounts;
  else if (path.endsWith("/accounting/periods")) body = periods;
  else if (path.endsWith("/accounting/controls")) body = { basis: "Current balances", reconciliations: [{ name: "Payables", account_code: "2000", control_balance: "90.25", document_balance: "90.25", difference: "0.00" }], unlinked_open_documents: 0, unbalanced_posted_journals: 0, undated_legacy_journals: 0, cross_tenant_lines: 0 };
  else if (path.endsWith("/accounting/journals")) body = journals;
  else if (/\/accounting\/journals\/[^/]+$/.test(path)) {
    const j = journals.find(j => path.endsWith("/" + j.id));
    body = { ...j, lines: [{ id: "dr", account_code: "5100", account_name: "Operating expenses", debit: "10.25", credit: "0.00" }, { id: "cr", account_code: "1000", account_name: "Cash on hand", debit: "0.00", credit: "10.25" }] };
  } else if (path.endsWith("/accounting/payables") || path.endsWith("/accounting/receivables")) body = [{ id: "doc", reference: "INV-001", description: "Consulting service", amount: "100.25", paid_amount: "10.00", received_amount: "10.00", status: "partially_paid", due_date: "2026-09-30", can_settle: true }];
  else if (path.endsWith("/accounting/contacts")) body = { suppliers: [{ id: "supplier", name: "Sample supplier" }], customers: [{ id: "customer", name: "Sample customer" }] };
  else if (path.endsWith("/accounting/bank-statements")) body = [{ id: "statement", account_id: "cash", statement_date: "2026-09-30", opening_balance: "100.00", closing_balance: "80.00", status: "open" }];
  else if (path.endsWith("/bank-statements/statement/lines")) body = [{ id: "bank-line", transaction_date: "2026-09-03", reference: "BANK-001", description: "Supplier payment", amount: "-20.00", matched_journal_id: null }];
  else if (path.endsWith("/accounting/budgets")) body = [{ id: "budget", name: "Operating budget", starts_on: "2026-09-01", ends_on: "2026-09-30", status: "draft", lines: [{ account_id: "expense", department: null, amount: "100.00" }] }];
  else if (path.endsWith("/budgets/budget/variance")) body = { name: "Operating budget", lines: [{ account_id: "expense", department: null, budget: "100.00", actual: "20.00", variance: "80.00" }] };
  else if (path.includes("/accounting/reports/") || path.endsWith("/accounting/general-ledger")) {
    reportRequests.push({ path, from: url.searchParams.get("from_date"), to: url.searchParams.get("to_date") });
    if (failReports) { status = 503; body = { detail: "Reports temporarily unavailable." }; }
    else if (path.endsWith("/trial-balance")) body = { items: balances };
    else if (path.endsWith("/financial-statements")) body = fs;
    else body = { opening_balances: { cash: "100.00" }, items: [{ line_id: "ledger-line", account_id: "cash", account_code: "1000", account_name: "Cash on hand", entry_date: "2026-09-03", date_basis: "entry_date", description: "Supplier payment", debit: "0.00", credit: "20.00", balance: "80.00" }] };
  } else if (path.endsWith("/health/ready")) body = { status: "ok" };
  else if (path.endsWith("/edge/status")) body = { cloud: "online" };
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
});
const page = await context.newPage();
page.on("pageerror", error => runtimeErrors.push(error.message));
async function snapshot(name) {
  await page.screenshot({ path: resolve(output, name + ".png"), fullPage: true });
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  results.push({ name, overflow, violations: axe.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })) });
  assert(!overflow, name + " has page overflow");
  assert.equal(axe.violations.length, 0, name + " accessibility violations: " + axe.violations.map(v => v.id).join(", "));
}
try {
  await page.goto(base + "/accounting");
  await page.getByRole("heading", { name: "Chart of accounts", exact: true }).waitFor();
  await snapshot("accounts-desktop");
  await page.getByRole("button", { name: "New journal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Accounting date").fill("2026-09-03");
  assert.equal(await dialog.getByRole("checkbox").count(), 0);
  assert.equal(await dialog.locator("option").filter({ hasText: "Inventory control" }).count(), 0);
  await dialog.getByLabel("Journal description / supporting reference").fill("Audit adjustment");
  await dialog.getByRole("combobox").nth(0).selectOption("expense");
  await dialog.getByLabel("debit", { exact: true }).nth(0).fill("10.25");
  await dialog.getByRole("combobox").nth(1).selectOption("cash");
  await dialog.getByLabel("credit", { exact: true }).nth(1).fill("10.25");
  await snapshot("journal-dialog");
  await dialog.getByRole("button", { name: "Submit for approval" }).click();
  await dialog.getByRole("button", { name: "Saving…" }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await dialog.count(), 1);
  await dialog.getByRole("alert").filter({ hasText: "Fixture rejection" }).waitFor();
  assert.equal(writeCount, 1, "Journal submitted once");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Journals", exact: true }).click();
  await page.getByRole("button", { name: "Review entry" }).nth(0).click();
  await dialog.getByRole("button", { name: "Approve & post" }).waitFor();
  await dialog.getByRole("button", { name: "Reject journal with reason" }).waitFor();
  await snapshot("journal-review");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Review entry" }).nth(1).click();
  assert.equal(await dialog.getByRole("button", { name: "Approve & post" }).count(), 0);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Reverse", exact: true }).count(), 0, "Source journals cannot be reversed here");
  await page.getByRole("button", { name: "Payables & receivables", exact: true }).click();
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  assert.equal(await dialog.locator("select option").count(), 2, "Only cash is available, not inventory");
  await snapshot("settlement-dialog");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Bank reconciliation", exact: true }).click();
  await page.getByText("BANK-001", { exact: true }).waitFor();
  assert(await page.getByRole("button", { name: "Finalise", exact: true }).isDisabled());
  await snapshot("bank-desktop");
  await page.getByRole("button", { name: "Budgets", exact: true }).click();
  await page.getByRole("button", { name: "Approve budget", exact: true }).click();
  await dialog.getByText("Operating expenses", { exact: true }).waitFor();
  await dialog.getByText("100.00", { exact: true }).waitFor();
  await snapshot("budget-approval-review");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "View variance" }).click();
  await page.getByRole("heading", { name: "Operating budget · variance" }).waitFor();
  await snapshot("budget-desktop");
  await page.getByRole("button", { name: "Ledger & reports", exact: true }).click();
  await page.getByRole("heading", { name: "Balance sheet", exact: true }).waitFor();
  await page.getByLabel("Activity from (optional)").fill("2026-09-01");
  await page.getByLabel("Through", { exact: true }).fill("2026-09-30");
  await page.getByRole("combobox", { name: /^Ledger account/ }).selectOption("cash");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.getByText("Opening balance: 100.00", { exact: true }).waitFor();
  assert(reportRequests.slice(-3).every(r => r.from === "2026-09-01" && r.to === "2026-09-30"), "All reports receive matching dates");
  await snapshot("reports-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await snapshot("reports-mobile");
  for (const [label, name] of [["Chart & periods", "accounts-mobile"], ["Journals", "journals-mobile"], ["Payables & receivables", "documents-mobile"], ["Bank reconciliation", "bank-mobile"], ["Budgets", "budgets-mobile"]]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    if (label === "Bank reconciliation") await page.getByText("BANK-001", { exact: true }).waitFor();
    await snapshot(name);
  }
  failReports = true;
  await page.getByRole("button", { name: "Ledger & reports", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Reports temporarily" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Balance sheet", exact: true }).count(), 0, "Failed reports are not shown as zeros");
  readOnly = true;
  await page.reload();
  await page.getByRole("heading", { name: "Chart of accounts", exact: true }).waitFor();
  for (const name of ["New journal", "New period", "New account", "Ledger & reports"]) assert.equal(await page.getByRole("button", { name, exact: true }).count(), 0, "Read-only access hides " + name);
  await snapshot("read-only-mobile");
  assert.deepEqual(runtimeErrors, []);
} finally {
  writeFileSync(resolve(output, "results.json"), JSON.stringify({ syntheticDataOnly: true, results, writeCount, reportRequests, runtimeErrors }, null, 2));
  await browser.close();
}
console.log("Accounting browser checks passed:", results.length, "snapshots; no accessibility violations or runtime errors.");
