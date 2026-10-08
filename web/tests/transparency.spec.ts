import { expect, test, type Locator } from "@playwright/test";

test.use({ locale: "en-US", reducedMotion: "reduce" });

async function alpha(target: Locator) {
  return target.evaluate((element) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    context.fillStyle = getComputedStyle(element).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data[3];
  });
}

for (const theme of ["Dark", "Light"]) {
  test(`transparency reveals the background without fading text or controls in ${theme.toLowerCase()} theme`, async ({
    page,
  }) => {
    await page.goto("/demo#/settings");
    await page.getByRole("radio", { name: theme, exact: true }).check();
    const slider = page.getByRole("slider", {
      name: "Panel transparency",
      exact: true,
    });
    const panel = page.locator(".transparency-settings").locator("..");
    const before = await alpha(panel);
    const headingColor = await panel
      .locator("h2")
      .evaluate((element) => getComputedStyle(element).color);
    await slider.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "85");
    expect(await alpha(panel)).toBeLessThan(before * 0.25);
    expect(await alpha(page.locator(".sidebar"))).toBeLessThan(50);
    expect(await alpha(page.locator(".topbar"))).toBeLessThan(50);
    await expect(panel).toHaveCSS("opacity", "1");
    await expect(panel.locator("h2")).toHaveCSS("color", headingColor);
    const language = page.getByRole("combobox", {
      name: "Language",
      exact: true,
    });
    expect(await alpha(language)).toBe(255);
    await language.click();
    expect(await alpha(page.locator(".select-content"))).toBe(255);
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page.locator(".server-card")).toHaveCount(4);
    expect(await alpha(page.locator(".server-card").first())).toBeLessThan(50);
    expect(await alpha(page.locator(".stat-card").first())).toBeLessThan(50);
    await expect(page.locator(".server-identity strong").first()).toHaveCSS(
      "opacity",
      "1",
    );
  });
}

test("transparency persists, syncs between tabs and resets independently of the background", async ({
  page,
  context,
}) => {
  await page.goto("/demo#/settings");
  await page.getByRole("radio", { name: "Overworld", exact: true }).check();
  const slider = page.getByRole("slider", {
    name: "Panel transparency",
    exact: true,
  });
  await slider.press("End");
  await slider.press("ArrowLeft");
  await slider.press("ArrowLeft");
  await expect(slider).toHaveAttribute("aria-valuenow", "75");
  await expect(
    page.getByRole("slider", { name: "Background intensity" }),
  ).toHaveAttribute("aria-valuenow", "40");
  await page.reload();
  await expect(slider).toHaveAttribute("aria-valuenow", "75");
  await expect(page.locator(".scene-overworld")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/demo#/settings");
  const otherSlider = other.getByRole("slider", {
    name: "Panel transparency",
    exact: true,
  });
  await expect(otherSlider).toHaveAttribute("aria-valuenow", "75");
  await otherSlider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", "0");
  await page.bringToFront();
  await slider.press("End");
  await page.getByRole("button", { name: "Reset appearance" }).click();
  await expect(slider).toHaveAttribute("aria-valuenow", "0");
  await expect(otherSlider).toHaveAttribute("aria-valuenow", "0");
  await other.close();
});

test("saved transparency is bounded and applied before the app bundle starts", async ({
  page,
}) => {
  await page.route("**/assets/*.js", (route) => route.abort());
  await page.addInitScript(() => {
    const panelTransparency = JSON.parse(
      new URL(location.href).searchParams.get("transparency") ?? "0",
    );
    localStorage.setItem(
      "emberdeck.preferences.v1",
      JSON.stringify({ panelTransparency }),
    );
  });
  for (const [value, expected] of [
    [65, 0.35],
    [1000, 0.15],
    [-5, 1],
    ["invalid", 1],
  ] as const) {
    await page.goto(
      `/demo?transparency=${encodeURIComponent(JSON.stringify(value))}`,
    );
    const opacity = await page
      .locator("html")
      .evaluate((element) =>
        Number(element.style.getPropertyValue("--surface-opacity")),
      );
    expect(opacity).toBeCloseTo(expected);
  }
});
