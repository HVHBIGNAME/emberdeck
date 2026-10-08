import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({ locale: "en-US", reducedMotion: "no-preference" });

async function expectBrand(page: Page) {
  const paint = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    const color = (name: string) => {
      context.fillStyle = style.getPropertyValue(name).trim();
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    return { fill: color("--accent-fill"), ink: color("--accent-ink") };
  });
  await expect(page.locator(".brand-mark rect").first()).toHaveCSS(
    "fill",
    `rgb(${paint.fill.slice(0, 3).join(", ")})`,
  );
  await expect(page.locator(".brand-mark path").first()).toHaveCSS(
    "fill",
    `rgb(${paint.ink.slice(0, 3).join(", ")})`,
  );
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    /^data:image\/svg\+xml,/,
  );
  const favicon = await page.evaluate(async () => {
    const image = new Image();
    const icon = document.head.querySelector("link[rel=icon]")!;
    image.src = icon.getAttribute("href")!;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 40;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0, 40, 40);
    return {
      fill: [...context.getImageData(4, 20, 1, 1).data],
      ink: [...context.getImageData(20, 9, 1, 1).data],
    };
  });
  expect(favicon).toEqual(paint);
}

for (const theme of ["Dark", "Light"]) {
  test(`logo and rendered favicon match every accent in ${theme.toLowerCase()} theme`, async ({
    page,
  }) => {
    await page.goto("/demo#/settings");
    await page.getByRole("radio", { name: theme, exact: true }).check();
    for (const accent of ["Moss", "Diamond", "Amethyst", "Ember"]) {
      await page.getByRole("radio", { name: accent, exact: true }).check();
      await expect(page.locator("html")).toHaveAttribute(
        "data-accent",
        accent.toLowerCase(),
      );
      await expectBrand(page);
    }
  });
}

test("branding follows saved settings, other tabs, system theme and reset", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/demo#/settings");
  await page.getByRole("radio", { name: "Amethyst", exact: true }).check();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "amethyst");
  await expectBrand(page);
  const other = await context.newPage();
  await other.goto("/demo#/settings");
  await other.getByRole("radio", { name: "Diamond", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "diamond");
  await page.bringToFront();
  await expectBrand(page);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectBrand(page);
  await page
    .getByRole("button", { name: "Reset appearance", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "ember");
  await expectBrand(page);
  await other.close();
});

test("pre-login branding and the favicon work under the native CSP", async ({
  page,
}) => {
  const policy = readFileSync(
    new URL("../../src/web.rs", import.meta.url),
    "utf8",
  ).match(/headers\.insert\("content-security-policy", "([^"]+)"/)?.[1];
  if (!policy) throw new Error("Native CSP not found");
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("401"))
      errors.push(message.text());
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      "emberdeck.preferences.v1",
      JSON.stringify({ accent: "amethyst", theme: "dark" }),
    ),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 401, json: { error: "Authentication required" } }),
  );
  await page.route(/\/$/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": policy },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Enter your workspace" }),
  ).toBeVisible();
  await expectBrand(page);
  expect(errors).toEqual([]);
});
