// Run against a LOCAL server only. All API calls are fulfilled with synthetic data.
// npm install --prefix /tmp/superstore-ui-audit playwright-core @axe-core/playwright
// UI_AUDIT_TOOLS=/tmp/superstore-ui-audit/node_modules node scripts/ui-audit-browser.mjs
import { createRequire } from "node:module";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const require = createRequire(resolve(process.env.UI_AUDIT_TOOLS || "/tmp/superstore-ui-audit/node_modules", "package.json"));
const { chromium } = require("playwright-core");
const { default: AxeBuilder } = require("@axe-core/playwright");
const base = process.env.UI_AUDIT_URL || "http://localhost:3015";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Only local audit targets are allowed.");
const output = process.env.UI_AUDIT_OUTPUT || "/tmp/superstore-ui-audit-results";
mkdirSync(output, { recursive: true });
const permissions = new Set();
for (const file of readdirSync("src", { recursive: true }).filter((file) => /\.tsx?$/.test(file))) {
  for (const match of readFileSync("src/" + file, "utf8").matchAll(/["']([a-z_]+(?:\.[a-z_]+)+)["']/g)) permissions.add(match[1]);
}
const product = { id: "audit-product", name: "Body Radiant Lotion", stock_code: "BRL001", barcode: null, category: "Skincare", service_area: "store", unit: "unit", cost_price: "11000.00", selling_price: "15499.00", reorder_level: 2, active: true, pos_enabled: true, controlled: false };
const category = { id: "audit-category", name: "Skincare", description: "Skin and body care", active: true };
const branches = [{ id: "audit-branch", name: "Main store", code: "MAIN", active: true }];
const auth = { user_id: "audit-user", tenant_id: "audit-tenant", tenant_public_id: null, role: "owner", role_id: null, is_global_role: false, branch_ids: ["audit-branch"], attributes: {}, membership_attributes: {}, permissions: [...permissions], denied_permissions: [], licensed_modules: ["store", "stock", "inventory", "hospital", "pharmacy", "laboratory", "accounting"], policies: [] };
const report = { fixtures: true, checks: [], pages: [], writesIntercepted: [], unexpectedApiPaths: [] };
const seenUnknown = new Set();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
let failHistory = false;
let historyDelay = 0;
await context.route("**/*", async (route) => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname;
  if (!path.includes("/api/v1/") && !path.includes("/health/")) {
    if (url.origin === new URL(base).origin) return route.continue();
    return route.abort();
  }
  let body = [], status = 200;
  const key = path.replace(/^.*(?=\/api\/v1\/)/, "");
  if (key.endsWith("/auth/refresh")) body = { access_token: "synthetic-audit-token", token_type: "bearer", password_change_required: false };
  else if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
    report.writesIntercepted.push({ path: key, method: request.method(), body: request.postDataJSON() });
    status = 422; body = { detail: "Audit fixture: save rejected. Please review the entered values." };
  } else if (key.endsWith("/auth/me/authorization")) body = auth;
  else if (key.endsWith("/auth/me")) body = { ...auth, email: "audit@example.test", full_name: "UI Audit" };
  else if (key.endsWith("/catalog/products/service-area-summary")) body = { counts: { store: 1, pharmacy: 0 }, total: 1, needs_review: 0 };
  else if (key.endsWith("/catalog/products")) {
    const items = !url.searchParams.get("query") || product.name.toLowerCase().includes(url.searchParams.get("query").toLowerCase()) ? [product] : [];
    body = { items, total: items.length, offset: 0, limit: 10, has_more: false };
  } else if (key.endsWith("/price-history")) {
    if (historyDelay) await new Promise((resolve) => setTimeout(resolve, historyDelay));
    status = failHistory ? 503 : 200;
    body = failHistory ? { detail: "History is temporarily unavailable." } : [{ id: "audit-history", selling_price: "15800.00", cost_price: "11500.00", reason: "Supplier invoice 001", source_type: "purchase_invoice", created_at: "2026-09-08T16:09:46Z" }];
  } else if (key.endsWith("/catalog/product-categories")) body = [category];
  else if (key.endsWith("/catalog/branches")) body = branches;
  else if (key.endsWith("/purchasing/suppliers")) body = [{ id: "audit-supplier", name: "Sample supplier", code: "SUP001", active: true, payment_terms_days: 30 }];
  else if (key.endsWith("/store/customers")) body = [{ id: "audit-customer", name: "Sample customer", customer_number: "CUS001", active: true }];
  else if (key.includes("/inventory/health/")) body = { low_stock: [], expiry_alerts: [], expired_count: 0 };
  else if (path.endsWith("/health/ready")) body = { status: "ok" };
  else if (key.endsWith("/edge/status")) body = { cloud: "online" };
  else if (key.endsWith("/sync/version")) body = { cursor: null };
  else if (key.includes("/sessions/current")) body = null;
  else if (key.endsWith("/pos/cash-points")) body = { cash_point_limit: 1, configured_count: 0, subscription_active: true, items: [], terminal_slots: [] };
  else if (key.endsWith("/catalog/tenant/resolve")) body = { name: "Audit workspace", currency: "NGN", settings: { timezone: "Africa/Lagos" } };
  else if (key.endsWith("/catalog/tenant/settings")) body = { tenant_id: "audit-tenant", public_id: "", name: "Audit workspace", slug: "audit", currency: "NGN", cash_point_limit: 1, branding_licensed: false, subscription_plan: null, settings: { brand_name: "Audit workspace", primary_color: "#0d9488", secondary_color: "#0f172a", timezone: "Africa/Lagos", enabled_modules: auth.licensed_modules, licensed_modules: auth.licensed_modules, login_badges: [], feature_flags: {} } };
  else if (key.startsWith("/api/v1/reports/")) { status = 503; body = { detail: "Audit fixture: reports are unavailable." }; }
  else if (key.endsWith("/accounting/dashboard")) body = { open_payables: "0", open_receivables: "0", unposted_journals: 0, pending_approval_journals: 0 };
  else if (!seenUnknown.has(key)) { seenUnknown.add(key); report.unexpectedApiPaths.push(key); }
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
});
const page = await context.newPage();
const runtimeErrors = [];
page.on("pageerror", (error) => runtimeErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
    runtimeErrors.push(message.text().slice(0, 1200));
  }
});

async function snapshot(name, scope) {
  await page.screenshot({ path: resolve(output, name + ".png"), fullPage: !scope });
  const axe = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]);
  if (scope) axe.include(scope);
  const result = await axe.analyze();
  const layout = await page.evaluate(() => ({
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    headings: [...document.querySelectorAll("h1")].map((node) => node.textContent),
    errorBoundary: document.body.textContent.includes("This page couldn’t load"),
    overflow: [...document.querySelectorAll("main *")].filter((element) => {
      if (!element.getClientRects().length || getComputedStyle(element).position === "fixed") return false;
      const rect = element.getBoundingClientRect();
      return rect.right > innerWidth + 1 && !element.closest('[class*="overflow-x-auto"], [class*="overflow-auto"]');
    }).slice(0, 8).map((element) => ({ tag: element.tagName, text: element.textContent?.slice(0, 60) })),
  }));
  const entry = { name, url: page.url(), layout, violations: result.violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length, examples: nodes.slice(0, 4).map(({ target, failureSummary }) => ({ target, failureSummary })) })), runtimeErrors: [...runtimeErrors] };
  report.pages.push(entry);
  console.log(JSON.stringify({ name, violations: entry.violations.map(({ id, count }) => ({ id, count })), layout, runtimeErrors }));
  runtimeErrors.length = 0;
}
async function check(name, action) {
  try { await action(); report.checks.push({ name, passed: true }); console.log("PASS", name); }
  catch (error) { report.checks.push({ name, passed: false, error: error.message }); console.error("FAIL", name, error.message); }
}

try {
  await page.goto(base + "/products");
  await page.getByRole("heading", { name: "Products", exact: true }).waitFor();
  await page.getByText("Body Radiant Lotion", { exact: true }).waitFor();
  await snapshot("products-desktop");
  await check("Native table fills its scroll region", async () => {
    assert(await page.locator("table").evaluate((table) => getComputedStyle(table).display === "table"));
    const widths = await page.locator("table").evaluate((table) => [table.getBoundingClientRect().width, table.parentElement.getBoundingClientRect().width]);
    assert(Math.abs(widths[0] - widths[1]) < 2);
  });
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.getByRole("dialog").waitFor();
  await check("Product dialog fits viewport and preserves native form values", async () => {
    const dialog = page.getByRole("dialog");
    const box = await dialog.boundingBox();
    assert(box.width <= 768 && box.height <= 970);
    await dialog.getByLabel("Operational area").selectOption("store");
    const area = await dialog.locator("form").evaluate((form) => new FormData(form).get("service_area"));
    assert.equal(area, "store");
  });
  await snapshot("product-editor-desktop", "dialog");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await check("Save error stays visible inside the open product dialog", async () => {
    await page.getByRole("dialog").getByRole("alert").waitFor();
    assert((await page.getByRole("dialog").getByRole("alert").innerText()).includes("Audit fixture"));
  });
  await check("Escape closes dialog and restores focus", async () => {
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), "Edit");
  });
  await page.getByRole("button", { name: /price.*history|price audit/i }).first().click();
  await page.getByText("Supplier invoice 001", { exact: true }).waitFor();
  await snapshot("price-history-desktop", "dialog");
  await check("Audit summary uses current product price, not last historical entry", async () => {
    assert((await page.getByRole("dialog").innerText()).includes("15,499.00"));
    assert((await page.getByRole("dialog").innerText()).includes("15,800.00"));
  });
  await page.keyboard.press("Escape");
  historyDelay = 1200;
  await page.getByRole("button", { name: /price.*history|price audit/i }).first().click();
  await check("Price history announces loading before records arrive", async () => {
    await page.getByRole("dialog").getByRole("status").waitFor();
  });
  await page.getByText("Supplier invoice 001", { exact: true }).waitFor();
  historyDelay = 0;
  await page.keyboard.press("Escape");
  failHistory = true;
  await page.getByRole("button", { name: /price.*history|price audit/i }).first().click();
  await page.getByRole("dialog").getByRole("alert").waitFor();
  failHistory = false;
  await page.getByRole("dialog").getByRole("button", { name: "Try again" }).click();
  await page.getByText("Supplier invoice 001", { exact: true }).waitFor();
  report.checks.push({ name: "Price history has recoverable error state", passed: true });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Manage categories" }).click();
  await snapshot("categories-desktop", "dialog");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await snapshot("products-mobile");
  await check("Closed mobile navigation is not keyboard-focusable", async () => {
    assert.equal(await page.locator("#workspace-navigation").evaluate((node) => getComputedStyle(node).visibility), "hidden");
  });
  await page.getByRole("button", { name: "Open menu" }).click();
  await snapshot("navigation-mobile");
  await check("Mobile navigation supports Escape and restores focus", async () => {
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("button", { name: "Open menu" }).getAttribute("aria-expanded"), "false");
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Open menu");
  });
  await page.getByRole("button", { name: /price.*history|price audit/i }).first().click();
  await page.getByText("Supplier invoice 001", { exact: true }).waitFor();
  await snapshot("price-history-mobile", "dialog");
  await page.keyboard.press("Escape");
  for (const route of ["contacts", "inventory", "purchasing", "pos", "hospital", "accounting", "settings", "reports", "does-not-exist-ui-audit"]) {
    await page.goto(base + "/" + route);
    await page.locator("h1").first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    if (route === "inventory") {
      await check("Searchable dropdown supports keyboard selection and Escape", async () => {
        const combo = page.getByRole("combobox", { name: "Choose branch for stock health", exact: true });
        await combo.focus();
        await page.keyboard.press("ArrowDown");
        await page.getByRole("listbox").waitFor();
        await page.keyboard.press("Escape");
        assert.equal(await combo.getAttribute("aria-expanded"), "false");
        assert(await combo.evaluate((node) => node === document.activeElement));
      });
    }
    await snapshot(route + "-mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await snapshot(route + "-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
  }
} finally {
  writeFileSync(resolve(output, "results.json"), JSON.stringify(report, null, 2));
  await browser.close();
  console.log("Audit artifacts:", output);
}
if (report.checks.some((check) => !check.passed) || report.pages.some((page) => page.layout.errorBoundary || page.runtimeErrors.length)) process.exitCode = 1;
