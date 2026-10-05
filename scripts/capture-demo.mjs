import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { preview } from "vite";

const destination = resolve("docs/media");
await mkdir(destination, { recursive: true });
const baseURL = (
  process.env.EMBER_CAPTURE_URL || "http://127.0.0.1:4174"
).replace(/\/$/, "");
const server = process.env.EMBER_CAPTURE_URL
  ? null
  : await preview({
      configFile: resolve("web/vite.config.ts"),
      preview: { host: "127.0.0.1", port: 4174, strictPort: true },
    });
let browser;
let captured = 0;

async function visit(page, route) {
  await page.goto(`${baseURL}/demo#${route}`, { waitUntil: "networkidle" });
  await page.locator("h1").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function snapshot(page, name, fullPage = true) {
  await page.screenshot({
    path: resolve(destination, `${name}.png`),
    animations: "disabled",
    fullPage,
  });
  captured++;
}

try {
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-10-05T18:24:00Z"));
  for (const [name, route] of [
    ["overview", "/overview"],
    ["settings", "/settings"],
    ["console", "/servers/oakheart/console"],
    ["library", "/library"],
    ["automations", "/automations"],
    ["diagnostics", "/servers/oakheart/diagnostics"],
    ["installation", "/install"],
  ]) {
    await visit(page, route);
    await snapshot(page, name);
  }
  await visit(page, "/settings");
  await page.getByRole("combobox", { name: "Language", exact: true }).click();
  await page.getByRole("option", { name: "Русский" }).click();
  await page
    .getByRole("heading", { name: "Пространство в вашем стиле." })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  await snapshot(page, "settings-ru");
  await visit(page, "/overview");
  await snapshot(page, "overview-ru");
  await visit(page, "/settings");
  await page.getByRole("radio", { name: "Светлая", exact: true }).check();
  await page.getByRole("combobox", { name: "Язык", exact: true }).click();
  await page.getByRole("option", { name: "English" }).click();
  await visit(page, "/overview");
  await snapshot(page, "overview-light");
  await context.close();

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
    locale: "ru-RU",
    reducedMotion: "reduce",
  });
  await mobile.clock.setFixedTime(new Date("2026-10-05T18:24:00Z"));
  for (const [name, route] of [
    ["mobile", "/overview"],
    ["settings-mobile", "/settings"],
    ["installation-mobile", "/install"],
  ]) {
    await visit(mobile, route);
    await snapshot(mobile, name);
  }
  await mobile.close();

  const recording = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    colorScheme: "dark",
    locale: "en-US",
    reducedMotion: "no-preference",
    recordVideo: { dir: destination, size: { width: 1920, height: 1080 } },
  });
  const tour = await recording.newPage();
  await tour.clock.setFixedTime(new Date("2026-10-05T18:24:00Z"));
  await visit(tour, "/overview");
  await tour.waitForTimeout(1800);
  await tour.locator(".server-identity").first().hover();
  await tour.waitForTimeout(1000);
  await tour
    .getByRole("button", { name: "New server", exact: true })
    .first()
    .click();
  await tour.waitForTimeout(1200);
  await tour
    .getByRole("combobox", { name: "Minecraft version", exact: true })
    .click();
  await tour.waitForTimeout(1000);
  await tour.keyboard.press("Escape");
  await tour.getByRole("listbox").waitFor({ state: "hidden" });
  await tour.keyboard.press("Escape");
  await tour.getByRole("dialog").waitFor({ state: "hidden" });
  await tour.getByRole("link", { name: "Settings", exact: true }).click();
  await tour
    .getByRole("heading", { name: "A workspace that feels like you." })
    .waitFor();
  await tour.waitForTimeout(1600);
  await tour.getByRole("radio", { name: "Overworld", exact: true }).check();
  await tour.waitForTimeout(1600);
  await tour.getByRole("radio", { name: "Light", exact: true }).check();
  await tour.waitForTimeout(1600);
  await tour.getByRole("combobox", { name: "Language", exact: true }).click();
  await tour.waitForTimeout(800);
  await tour.getByRole("option", { name: "Русский" }).click();
  await tour.waitForTimeout(1500);
  await tour.getByRole("switch", { name: "Анимации", exact: true }).click();
  await tour.waitForTimeout(1200);
  await tour.getByRole("link", { name: "Обзор", exact: true }).click();
  await tour.waitForTimeout(2500);
  const video = tour.video();
  await recording.close();
  if (video) {
    await video.saveAs(resolve(destination, "walkthrough.webm"));
    await video.delete();
  }
  console.log(
    `Captured ${captured} screenshots and an animated walkthrough in ${destination}`,
  );
} finally {
  await browser?.close();
  if (server)
    await new Promise((resolve, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
}
