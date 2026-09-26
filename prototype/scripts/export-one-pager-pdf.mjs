import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const require = createRequire(new URL("../package.json", import.meta.url));
const { chromium } = require("playwright");
const html = path.join(root, "public", "solution-one-pager.html");
const output = path.join(root, "SOLUTION-ONE-PAGER.pdf");
const preview = path.join(root, "scripts", "screenshots", "solution-one-pager.png");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.goto(pathToFileURL(html).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.locator(".page").evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  if (layout.scrollHeight > layout.clientHeight) {
    throw new Error(`One-pager overflows by ${layout.scrollHeight - layout.clientHeight}px.`);
  }
  await page.pdf({
    path: output,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
  fs.mkdirSync(path.dirname(preview), { recursive: true });
  await page.screenshot({ path: preview, fullPage: true });
  console.log(`Wrote ${output}`);
} finally {
  await browser.close();
}
