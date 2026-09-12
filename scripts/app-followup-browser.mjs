// Local-only checks. Every API request is intercepted with synthetic data.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(resolve(process.env.UI_AUDIT_TOOLS || "/tmp/superstore-ui-audit/node_modules", "package.json"));
const { chromium } = require("playwright-core");
const base = process.env.UI_AUDIT_URL || "http://127.0.0.1:3017";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = "/tmp/superstore-app-followup-browser";
mkdirSync(output, { recursive: true });
const authorization = {
  user_id: "11111111-1111-4111-8111-111111111111", tenant_id: "22222222-2222-4222-8222-222222222222",
  role: "owner", branch_ids: [], attributes: {}, membership_attributes: {}, policies: [],
  permissions: ["sales.create", "sales.read", "cash_sessions.open", "hospital.patients.read", "hospital.nursing.document", "hospital.encounters.read"],
  denied_permissions: [], licensed_modules: ["store", "stock", "inventory", "hospital"],
};
const product = { id: "product", stock_code: "FIXTURE", name: "Fixture product", selling_price: "100.00", available_quantity: "20", active: true };
const sales = [];
const clinicalReads = [];
const errors = [];
let unavailable = false;
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    const path = url.pathname.replace(/^.*(?=\/api\/v1\/)/, "");
    if (!path.includes("/api/v1/") && !path.includes("/health/")) {
      return url.origin === new URL(base).origin ? route.continue() : route.abort();
    }
    let body = [], status = 200;
    if (path.endsWith("/auth/refresh")) body = { access_token: "synthetic-token", token_type: "bearer" };
    else if (request.method() === "POST" && path.endsWith("/pos/sales")) {
      sales.push(request.postDataJSON());
      if (sales.length === 1) { unavailable = true; return route.abort("failed"); }
      body = { sale_id: "sale", receipt_number: "FIXTURE-RECEIPT", total: "100.00", cash_point_number: 1, duplicate: true, low_stock: [] };
    } else if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      return route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ detail: "Unexpected synthetic write" }) });
    } else if (path.endsWith("/auth/me/authorization")) body = authorization;
    else if (path.endsWith("/auth/me")) body = { ...authorization, full_name: "Test operator", email: "test@example.test" };
    else if (path.endsWith("/catalog/tenant/settings") || path.endsWith("/catalog/tenant/resolve")) body = { name: "Test workspace", currency: "NGN", settings: { timezone: "Africa/Lagos", enabled_modules: authorization.licensed_modules, licensed_modules: authorization.licensed_modules, feature_flags: {} } };
    else if (path.endsWith("/health/ready")) { body = { status: "ready" }; status = unavailable ? 503 : 200; }
    else if (path.endsWith("/edge/status")) body = { cloud: "online" };
    else if (path.endsWith("/catalog/branches")) body = [{ id: "branch", name: "Test branch", code: "TEST" }];
    else if (path.endsWith("/pos/cash-points")) body = { items: [{ id: "terminal", number: 1, available: true }], cash_point_limit: 1, subscription_active: true, terminal_slots: [] };
    else if (path.endsWith("/pos/sessions/current")) body = { cash_session_id: "session", session_number: "SESSION", cash_point_id: "terminal", cash_point_number: 1, status: "open", work_period_started_at: null, work_period_ends_at: null };
    else if (path.endsWith("/pos/products")) body = [product];
    else if (path.endsWith("/medications/administrations") || path.endsWith("/clinical/referrals")) {
      clinicalReads.push({ path, purpose: url.searchParams.get("purpose") });
    }
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + "/pos");
  await page.getByPlaceholder("Scan stock code or search item name…").fill("Fixture");
  await page.getByRole("button", { name: /Fixture product/ }).click();
  const pay = page.getByRole("button", { name: /^Pay/ });
  await pay.waitFor();
  unavailable = true;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("superstore:api-connectivity", { detail: false })));
  await page.getByText("Reconnect to take payment. Sales cannot be saved offline.").waitFor();
  assert(await pay.isDisabled());
  await page.keyboard.press("F4");
  assert.equal(sales.length, 0);
  assert.equal(await page.getByText("Sale will sync later", { exact: true }).count(), 0);
  await page.screenshot({ path: output + "/offline-pos.png", fullPage: true });
  unavailable = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => /^Pay/.test(button.textContent.trim()) && !button.disabled));
  await pay.click();
  const confirm = page.getByRole("button", { name: /Confirm payment/ });
  await confirm.click();
  await page.getByText(/The sale could not be confirmed/).first().waitFor();
  assert.equal(sales.length, 1);
  unavailable = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.getByText("Reconnect to take payment. Sales cannot be saved offline.").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Card", exact: true }).click();
  await page.getByPlaceholder("Reference *", { exact: true }).fill("DIFFERENT-PAYMENT");
  await confirm.click();
  await page.getByText(/A payment is awaiting confirmation/).first().waitFor();
  assert.equal(sales.length, 1, "A different payment must not reuse the pending request");
  await page.getByRole("button", { name: "Cash", exact: true }).click();
  await confirm.click();
  await page.getByText("Existing sale restored", { exact: true }).waitFor();
  assert.equal(sales.length, 2);
  assert.deepEqual(sales[0], sales[1], "Retry must preserve the request ID, basket, and payment");
  await page.screenshot({ path: output + "/recovered-payment.png", fullPage: true });
  for (const path of ["/hospital/medications", "/hospital/referrals"]) {
    const response = page.waitForResponse(response => /medications\/administrations|clinical\/referrals/.test(response.url()));
    await page.goto(base + path);
    await response;
  }
  assert(clinicalReads.some(read => read.purpose === "medication_rounds"));
  assert(clinicalReads.some(read => read.purpose === "care_coordination"));
  assert(clinicalReads.every(read => read.purpose));
  assert.deepEqual(errors, []);
  writeFileSync(output + "/results.json", JSON.stringify({ status: "passed", scenarios: ["offline payment blocked", "uncertain payment recovered with identical request", "clinical read purposes"], clinicalReads, errors }, null, 2));
  process.stdout.write("Passed: offline POS, payment recovery, clinical read purposes; no browser runtime errors.\n");
} finally {
  await browser.close();
}
