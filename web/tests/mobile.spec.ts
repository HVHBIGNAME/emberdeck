import { expect, test } from "@playwright/test";

test.use({ locale: "en-US", reducedMotion: "reduce" });

for (const width of [320, 390, 440]) {
  test(`mobile header and dock fit ${width}px and leave content reachable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 956 });
    await page.goto("/demo");
    const dock = page.getByRole("navigation", { name: "Main navigation" });
    await expect(dock).toBeVisible();
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.locator(".breadcrumb")).toBeHidden();
    await expect(page.locator(".topbar-preferences")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toHaveCount(0);
    await expect(page.locator(".topbar-create > span")).toBeHidden();
    const controls = page.locator(
      ".mobile-dock > a, .mobile-dock > button, .topbar .global-search, .topbar .mobile-assistant, .topbar-create",
    );
    for (const control of await controls.all()) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footer = await page.locator(".page-footer").boundingBox();
    const dockBox = await dock.boundingBox();
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(dockBox!.y);
    await dock.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "A workspace that feels like you." }),
    ).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(
      dock.getByRole("link", { name: "Settings", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}

test("mobile search, assistant, create action and secondary navigation work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 440, height: 956 });
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Find a server…", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Search servers" }).fill("Everfrost");
  await page
    .locator(".search-results")
    .getByRole("button", { name: /Everfrost/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Everfrost", exact: true }),
  ).toBeVisible();
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Ask Ember", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Meet Ember." })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Select server" }),
  ).toContainText("Everfrost");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.locator(".topbar-create").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const wizard = page.getByRole("dialog");
  for (let step = 0; step < 3; step++) {
    expect(
      await wizard.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    if (step === 1)
      await wizard
        .getByRole("textbox", { name: "Server name", exact: true })
        .fill("Mobile test world");
    if (step < 2)
      await wizard
        .getByRole("button", { name: "Continue", exact: true })
        .click();
  }
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "More sections", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Workspace sections" });
  const rect = await sheet.boundingBox();
  expect(rect!.y + rect!.height).toBeGreaterThan(920);
  await sheet.getByRole("link", { name: "Backups", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Peace of mind, on disk." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "More sections", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("all server sections are reachable on mobile and data rows fit as cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo#/servers/oakheart");
  await page.getByRole("tab", { name: "Console", exact: true }).click();
  await expect(page.locator(".terminal")).toBeVisible();
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "server.properties", exact: true }),
  ).toBeVisible();
  for (const name of [
    "Plugins",
    "Backups",
    "Automations",
    "Diagnostics",
    "Settings",
  ]) {
    const more = page.locator(".compact-sections > button").last();
    await more.click();
    await page
      .getByRole("dialog", { name: "Server sections" })
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tabpanel")).toBeVisible();
    for (const row of await page.locator(".mobile-cards tbody tr").all()) {
      expect(
        await row.evaluate((element) => element.scrollWidth),
      ).toBeLessThanOrEqual(358);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  }
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page
    .getByRole("tab", { name: "Overview", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Console", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("tab", { name: "Console", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.setViewportSize({ width: 1536, height: 1080 });
  await expect(page.locator(".mobile-dock")).toHaveCount(0);
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.getByRole("tablist").getByRole("tab")).toHaveCount(8);
});
