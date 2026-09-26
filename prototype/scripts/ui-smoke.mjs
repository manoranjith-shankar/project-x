import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(new URL("../package.json", import.meta.url));
const { chromium } = require("playwright");
const base = process.env.UI_BASE || "http://localhost:4740";
const outDir = path.join(here, "screenshots");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];

page.on("pageerror", (err) => errors.push(err.message));

await page.goto(base, { waitUntil: "domcontentloaded" });

if ((await page.locator("#lander .issues li").count()) !== 3) {
  errors.push("lander should show exactly three workflow problems");
}
if (!(await page.locator("#lander .promise").innerText()).includes("John joins the context")) {
  errors.push("lander missing John promise");
}
if (await page.locator("#desk").isVisible()) errors.push("John application must stay hidden before Open John");
if (!(await page.locator(".mark").innerText()).includes("John AI Agent")) {
  errors.push("header should read John AI Agent");
}
if (await page.locator(".pill").count()) errors.push("header pills should be removed");
if ((await page.locator("#rail button").count()) !== 2) errors.push("rail should have two tabs only");
if (!await page.locator('button[data-rail="1"]').innerText().then((t) => t.includes("The problem"))) {
  errors.push("rail label missing The problem");
}
if ((await page.locator("#open-john").innerText()) !== "Open John") errors.push("CTA should read Open John");

await page.screenshot({ path: path.join(outDir, "01-lander.png"), fullPage: true });

await page.click("#open-john");
await page.waitForSelector("#desk:not([hidden])");
if (!await page.locator(".slack-surface").isVisible()) errors.push("John should open inside the Slack surface");
if (!(await page.locator(".slack-channel").innerText()).includes("invoice-operations")) {
  errors.push("Slack channel name is missing");
}

const deskText = await page.locator(".desk-main").textContent();
if (!deskText.includes("Connect the workflow sources")) errors.push("desk missing source integration setup");
if (deskText.includes("How AI is used")) errors.push("How AI is used should not be on the UI");
if (deskText.includes("Key technical choices")) errors.push("Technical choices should not be on the UI");
if (deskText.includes("Follow-up build")) errors.push("Follow-up build should not be on the UI");

const sourceButtons = await page.locator("#sources .source").allInnerTexts();
if (sourceButtons.length !== 0) errors.push("workspace should start empty");
if (sourceButtons.some((t) => /Email\s+Email/i.test(t))) errors.push("duplicate Email label in sidebar");

await page.screenshot({ path: path.join(outDir, "02-desk.png"), fullPage: true });

for (const [index, id] of ["inbox", "calendar", "call-note", "pipeline"].entries()) {
  await page.click(`[data-add="${id}"]`);
  await page.waitForFunction((count) => document.querySelectorAll("#sources .source").length === count, index + 1);
}
if ((await page.locator("#sources .source").count()) !== 4) errors.push("all four sources should appear after add");
if (await page.locator("#submit").isDisabled()) errors.push("Ask John should enable after all sources are added");
if (!(await page.locator("#chips .flow").first().innerText()).includes("Invoice status")) {
  errors.push("primary Slack suggestion should be Invoice status");
}

await page.click('[data-source="inbox"]');
await page.waitForSelector("#source-dialog[open]");
const inboxPayload = JSON.parse(await page.locator("#source-view").innerText());
if (inboxPayload.integration.name !== "Microsoft 365 Mail") errors.push("email integration metadata is missing");
if (inboxPayload.records.length !== 10) errors.push("email integration should expose ten records");
await page.screenshot({ path: path.join(outDir, "03-source-json.png"), fullPage: true });
await page.click("#source-close");

await page.click('[data-remove="inbox"]');
await page.waitForFunction(() => document.querySelectorAll("#sources .source").length === 3);
if (!await page.locator("#submit").isDisabled()) errors.push("Ask John should disable after a source is removed");
await page.click('[data-add="inbox"]');
await page.waitForFunction(() => document.querySelectorAll("#sources .source").length === 4);

await page.click("#simulate-flow");
await page.waitForSelector("#accordion:not([hidden])");
if ((await page.locator("#accordion .panel").count()) !== 4) errors.push("ordinary workflow should have four panels");

await page.click("#simulate-complex");
await page.waitForSelector("#complex-flow:not([hidden])");
if ((await page.locator("#complex-flow li").count()) !== 8) errors.push("duplicate-payment case should show both four-step workflows");
if (!(await page.locator("#complex-flow").innerText()).toLowerCase().includes("workflow adjustment with john")) {
  errors.push("complex case should show John's workflow adjustment");
}
await page.screenshot({ path: path.join(outDir, "04-complex-case.png"), fullPage: true });

await page.click("#chips .flow:first-child");
await page.waitForSelector(".slack-user-message");
if (!(await page.locator(".slack-user-message").innerText()).includes("@john what is the status of invoice INV-2048?")) {
  errors.push("Invoice status suggestion should post Mano's Slack message immediately");
}

await browser.close();

if (errors.length) {
  console.error("UI smoke failed:\n" + errors.map((e) => `- ${e}`).join("\n"));
  process.exit(1);
}

console.log(`UI smoke passed. Screenshots in ${outDir}`);
