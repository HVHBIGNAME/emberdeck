import { expect, test, type Page } from "@playwright/test";

test.use({ locale: "en-US", reducedMotion: "no-preference" });

async function freeze(page: Page) {
  const time = new Date("2026-10-08T12:00:00Z");
  await page.clock.install({ time });
  await page.clock.pauseAt(time);
}

test("fast startup keeps its screen for 900ms while the workspace loads underneath", async ({
  page,
}) => {
  await freeze(page);
  await page.goto("/demo");
  await expect(page.locator(".startup-screen")).toBeVisible();
  await expect(page.locator(".server-card")).toHaveCount(4);
  await expect(page.locator(".startup-content")).toHaveAttribute("inert", "");
  await page.clock.runFor(899);
  await expect(page.locator(".startup-screen")).toHaveCSS("opacity", "1");
  await page.clock.resume();
  await expect(page.locator(".startup-screen")).toHaveCount(0);
  await expect(page.locator(".startup-content")).not.toHaveAttribute("inert");
  await expect(
    page.getByRole("heading", { name: "Your worlds, in good hands." }),
  ).toBeVisible();
});

test("startup preference persists and removes the artificial wait on reload", async ({
  page,
  context,
}) => {
  await page.goto("/demo#/settings");
  const toggle = page.getByRole("switch", {
    name: "Smooth startup",
    exact: true,
  });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  const other = await context.newPage();
  await other.goto("/demo#/settings");
  await expect(
    other.getByRole("switch", { name: "Smooth startup", exact: true }),
  ).not.toBeChecked();
  await other.close();
  await page.bringToFront();
  await freeze(page);
  await page.reload();
  await expect(
    page.locator(".startup-content .preferences-page"),
  ).toBeVisible();
  await page.clock.runFor(350);
  await expect(page.locator(".startup-screen")).toHaveCount(0);
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await page.clock.runFor(1000);
  await expect(page.locator(".startup-screen")).toHaveCount(0);
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page.clock.runFor(350);
  await expect(page.locator(".startup-screen")).toHaveCount(0);
});

for (const mode of ["animations off", "reduced motion"] as const) {
  test(`${mode} bypasses the minimum without erasing the startup preference`, async ({
    page,
  }) => {
    await page.addInitScript((mode) => {
      localStorage.setItem(
        "emberdeck.preferences.v1",
        JSON.stringify({
          loadingIntro: true,
          animations: mode !== "animations off",
        }),
      );
    }, mode);
    if (mode === "reduced motion")
      await page.emulateMedia({ reducedMotion: "reduce" });
    await freeze(page);
    await page.goto("/demo#/settings");
    await page.clock.runFor(100);
    await expect(page.locator(".startup-screen")).toHaveCount(0);
    await expect(
      page.getByRole("switch", { name: "Smooth startup", exact: true }),
    ).toBeChecked();
  });
}

test("a slow connection keeps loading visible until authentication settles", async ({
  page,
}) => {
  await freeze(page);
  let release!: () => void;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/me", async (route) => {
    await response;
    await route.fulfill({
      status: 401,
      json: { error: "Authentication required" },
    });
  });
  await page.goto("/");
  await expect(page.locator(".startup-screen")).toBeVisible();
  await page.clock.runFor(2000);
  await expect(page.locator(".startup-screen")).toHaveCSS("opacity", "1");
  release();
  await expect(page.locator(".login-screen")).toBeVisible();
  await page.clock.runFor(350);
  await expect(page.locator(".startup-screen")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Enter your workspace" }),
  ).toBeVisible();
});

test("connection errors bypass the decorative wait", async ({ page }) => {
  await freeze(page);
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 502,
      contentType: "text/html",
      body: "Bad Gateway",
    }),
  );
  await page.goto("/");
  await page.clock.runFor(100);
  await expect(page.locator(".startup-screen")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("HTTP 502");
});
