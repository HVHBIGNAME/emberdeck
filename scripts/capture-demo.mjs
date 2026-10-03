import { chromium } from "@playwright/test";
import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";

const baseURL = process.env.EMBER_CAPTURE_URL || "http://127.0.0.1:4173";
const destination = resolve("docs/media");
await mkdir(destination, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1536, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
  reducedMotion: "reduce",
  recordVideo: { dir: destination, size: { width: 1536, height: 1080 } },
});
const page = await context.newPage();
await page.clock.setFixedTime(new Date("2026-10-02T18:24:00Z"));
const sections = [
  ["overview", "/overview"],
  ["installation", "/install"],
  ["console", "/servers/oakheart/console"],
  ["library", "/library"],
  ["automations", "/automations"],
  ["diagnostics", "/servers/oakheart/diagnostics"],
];
for (const [name, route] of sections) {
  await page.goto(`${baseURL}/demo#${route}`, { waitUntil: "networkidle" });
  await page
    .locator(route === "/install" ? ".install-screen" : ".main-content")
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(650);
  await page.screenshot({
    path: resolve(destination, `${name}.png`),
    animations: "disabled",
    fullPage: name === "overview" || name === "installation",
  });
  await page.waitForTimeout(1600);
}
const video = page.video();
await context.close();
if (video)
  await rename(await video.path(), resolve(destination, "walkthrough.webm"));
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  colorScheme: "dark",
  reducedMotion: "reduce",
});
await mobile.goto(`${baseURL}/demo`, { waitUntil: "networkidle" });
await mobile.evaluate(() => document.fonts.ready);
await mobile.screenshot({
  path: resolve(destination, "mobile.png"),
  fullPage: true,
  animations: "disabled",
});
await mobile.goto(`${baseURL}/demo#/install`, { waitUntil: "networkidle" });
await mobile
  .getByRole("heading", { name: "One command. Your choice." })
  .waitFor();
await mobile.screenshot({
  path: resolve(destination, "installation-mobile.png"),
  fullPage: true,
  animations: "disabled",
});
await browser.close();
console.log(
  `Captured ${sections.length} desktop views, two mobile views, and walkthrough in ${destination}`,
);
