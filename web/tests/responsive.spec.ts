import { expect, test, devices } from "@playwright/test";

test.use({ locale: "en-US" });

const views = {
  "/overview": "Ваши миры в надёжных руках.",
  "/settings": "Пространство в вашем стиле.",
  "/library": "Мир возможностей.",
  "/blueprints": "Основа для вашего мира.",
  "/automations": "Меньше рутины, больше игры.",
  "/backups": "Спокойствие в каждой копии.",
  "/nodes": "Ваша инфраструктура.",
  "/access": "Свой ключ для каждого.",
  "/activity": "Активность пространства.",
  "/servers/oakheart/console": "Oakheart SMP",
  "/servers/oakheart/files": "Oakheart SMP",
  "/servers/oakheart/diagnostics": "Oakheart SMP",
  "/servers/oakheart/settings": "Oakheart SMP",
  "/install": "Одна команда. Ваш выбор.",
};
const serverTabs: Record<string, string> = {
  "/servers/oakheart/console": "Консоль",
  "/servers/oakheart/files": "Файлы",
  "/servers/oakheart/diagnostics": "Диагностика",
  "/servers/oakheart/settings": "Настройки",
};

for (const theme of ["light", "dark"] as const) {
  for (const [width, height] of [
    [2560, 1440],
    [390, 844],
    [320, 740],
  ]) {
    test(`${theme} layouts fit a ${width}px viewport including large text`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(
        (theme) =>
          localStorage.setItem(
            "emberdeck.preferences.v1",
            JSON.stringify({ theme, language: "ru", density: "large" }),
          ),
        theme,
      );
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const [route, title] of Object.entries(views)) {
        await page.goto(`/demo#${route}`);
        await expect(
          page.getByRole("heading", { name: title, exact: true, level: 1 }),
        ).toBeVisible();
        if (serverTabs[route])
          await expect(
            page.getByRole("tab", {
              name: serverTabs[route],
              selected: true,
              exact: true,
            }),
          ).toBeVisible();
        await expect(page.locator(".loading")).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          route,
        ).toBeLessThanOrEqual(width);
        if (width <= 390 && route === "/servers/oakheart/console") {
          const terminal = await page.locator(".terminal").boundingBox();
          const download = await page
            .getByRole("button", { name: "Скачать лог консоли", exact: true })
            .boundingBox();
          expect(download).not.toBeNull();
          expect(download!.x + download!.width).toBeLessThanOrEqual(
            terminal!.x + terminal!.width,
          );
        }
        if (width <= 390 && route === "/blueprints") {
          for (const card of await page
            .locator(".blueprint-library-card")
            .all()) {
            const box = await card.boundingBox();
            const tag = await card.locator(".tag").boundingBox();
            expect(tag!.x + tag!.width).toBeLessThanOrEqual(
              box!.x + box!.width,
            );
          }
        }
        if (width === 2560 && route === "/overview") {
          const layout = await page.evaluate(() => ({
            width: document
              .querySelector(".main-content")!
              .getBoundingClientRect().width,
            font: parseFloat(
              getComputedStyle(document.documentElement).fontSize,
            ),
            columns: getComputedStyle(
              document.querySelector(".server-grid")!,
            ).gridTemplateColumns.split(" ").length,
          }));
          expect(layout.width).toBeGreaterThan(2100);
          expect(layout.font).toBeGreaterThanOrEqual(17);
          expect(layout.columns).toBe(4);
        }
        if (width <= 390 && route === "/overview") {
          const labels = await page
            .locator(".chart text")
            .evaluateAll((elements) =>
              elements
                .filter((element) => Number(element.getAttribute("y")) > 230)
                .map((element) => ({
                  left: element.getBoundingClientRect().left,
                  right: element.getBoundingClientRect().right,
                })),
            );
          for (let i = 1; i < labels.length; i++)
            expect(labels[i].left).toBeGreaterThan(labels[i - 1].right);
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

test("focus cursor frames controls, keeps text cursors native and can be disabled", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/demo#/settings");
  const toggle = page.getByRole("switch", { name: "Animations", exact: true });
  await toggle.hover();
  await expect(page.locator("html")).toHaveAttribute("data-cursor", "custom");
  await expect(page.locator(".cursor-outline")).toHaveCSS("opacity", "1");
  await expect
    .poll(async () => {
      const target = await toggle.boundingBox();
      const outline = await page.locator(".cursor-outline").boundingBox();
      return (
        Math.abs(outline!.width - target!.width - 8) +
        Math.abs(outline!.x - target!.x + 4)
      );
    })
    .toBeLessThan(2);
  await page.getByRole("switch", { name: "Focus cursor", exact: true }).click();
  await expect(page.locator(".focus-cursor")).toHaveCount(0);
  await page.getByRole("switch", { name: "Focus cursor", exact: true }).click();
  await page
    .getByRole("button", { name: "New server", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Server name", exact: true }).hover();
  await expect(page.locator("html")).toHaveAttribute("data-cursor", "native");
  await expect(page.locator(".cursor-outline")).toHaveCSS("opacity", "0");
});

test("touch devices retain native input and mobile navigation works", async ({
  browser,
}) => {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    locale: "en-US",
  });
  try {
    const page = await context.newPage();
    await page.goto(`${test.info().project.use.baseURL}/demo`);
    await expect(page.locator(".server-card")).toHaveCount(4);
    await expect(page.locator(".focus-cursor")).toHaveCount(0);
    await expect(
      page
        .locator(".topbar")
        .getByRole("button", { name: "Find a server…", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator(".topbar")
        .getByRole("button", { name: "New server", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "More sections", exact: true })
      .tap();
    await expect(
      page.getByRole("dialog", { name: "Workspace sections" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "More sections", exact: true }),
    ).toBeFocused();
    await page.getByRole("link", { name: "Settings", exact: true }).tap();
    await expect(
      page.getByRole("heading", { name: "A workspace that feels like you." }),
    ).toBeVisible();
    await page.getByRole("combobox", { name: "Language", exact: true }).tap();
    await page.getByRole("option", { name: "Русский" }).tap();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  } finally {
    await context.close();
  }
});
