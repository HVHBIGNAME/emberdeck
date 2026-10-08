import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({ locale: "en-US", reducedMotion: "no-preference" });

async function framed(page: Page, target: Locator) {
  await expect(page.locator("html")).toHaveAttribute("data-cursor", "custom");
  await expect
    .poll(async () => {
      const box = await target.boundingBox();
      const frame = await page.locator(".cursor-outline").boundingBox();
      if (!box || !frame) return Infinity;
      return (
        Math.abs(frame.x - box.x + 4) +
        Math.abs(frame.y - box.y + 4) +
        Math.abs(frame.width - box.width - 8) +
        Math.abs(frame.height - box.height - 8)
      );
    })
    .toBeLessThan(2);
}

test("server cards have a complete link surface and nested actions stay independent", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/demo");
  const card = page.locator(".server-card").first();
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.66);
  await framed(page, card);
  const copy = card.getByRole("button", {
    name: "Copy address for Oakheart SMP",
  });
  await copy.click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(
    card.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "25565",
  );
  const menu = card.getByRole("button", { name: "Actions for Oakheart SMP" });
  await menu.click();
  await expect(card.locator(".popover")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card.locator(".popover")).not.toBeVisible();
  await expect(menu).toBeFocused();
  await page.mouse.click(
    box!.x + box!.width * 0.6,
    box!.y + box!.height * 0.66,
  );
  await expect(page).toHaveURL(/#\/servers\/oakheart$/);
  await expect(
    page.getByRole("heading", { name: "Oakheart SMP", exact: true }),
  ).toBeVisible();
});

test("a blueprint is one complete card, including its artwork and description", async ({
  page,
}) => {
  await page.goto("/demo#/blueprints");
  const card = page.locator(".blueprint-library-card").first();
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await framed(page, card);
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".wizard-blueprints .selected")).toContainText(
    "Paper",
  );
});

test("cursor follows choice boundaries, all four corners and rounded pills", async ({
  page,
}) => {
  await page.goto("/demo#/settings");
  const choice = page
    .getByRole("radio", { name: "Diamond", exact: true })
    .locator("..");
  await choice.hover();
  await framed(page, choice);
  await choice.evaluate((element) => {
    element.style.borderRadius = "0px 24px 8px 16px";
  });
  await page.mouse.move(5, 5);
  await choice.hover();
  await expect
    .poll(() =>
      page.locator(".cursor-outline").evaluate((element) => {
        const style = getComputedStyle(element);
        return [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomRightRadius,
          style.borderBottomLeftRadius,
        ].map((value) => Math.round(parseFloat(value)));
      }),
    )
    .toEqual([0, 28, 12, 20]);
  const toggle = page.getByRole("switch", { name: "Animations", exact: true });
  await toggle.hover();
  await framed(page, toggle);
  await expect
    .poll(async () => {
      const geometry = await page
        .locator(".cursor-outline")
        .evaluate((element) => ({
          height: element.getBoundingClientRect().height,
          radius: parseFloat(getComputedStyle(element).borderTopLeftRadius),
        }));
      return Math.abs(geometry.height / 2 - geometry.radius);
    })
    .toBeLessThan(1);
});

test("custom selectors are framed both closed and in their portal", async ({
  page,
}) => {
  await page.goto("/demo#/settings");
  const trigger = page.getByRole("combobox", { name: "Interface size" });
  await trigger.hover();
  await framed(page, trigger);
  await trigger.click();
  const option = page.getByRole("option", { name: "Compact", exact: true });
  await option.hover();
  await framed(page, option);
  await option.click();
  await expect(trigger).toHaveText("Compact");
});

test("sliders animate their fill and keep the entire field framed during a drag", async ({
  page,
}) => {
  await page.goto("/demo#/settings");
  const slider = page.getByRole("slider", { name: "Background intensity" });
  const field = page.locator(".background-settings .range-field");
  await field.hover();
  await framed(page, field);
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", "0");
  const fill = field.locator(".range-fill");
  await expect(fill).toHaveCSS("transition-property", /right/);
  await expect
    .poll(() =>
      fill.evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeLessThan(1);
  const trackWidth = (await field.locator(".range-track").boundingBox())!.width;
  const transition = fill.evaluate(async (element) => {
    const widths: number[] = [];
    for (let frame = 0; frame < 20; frame++) {
      await new Promise(requestAnimationFrame);
      widths.push(element.getBoundingClientRect().width);
    }
    return widths;
  });
  await slider.press("End");
  expect(
    (await transition).some((width) => width > 2 && width < trackWidth - 2),
  ).toBe(true);
  await expect(slider).toHaveAttribute("aria-valuenow", "80");
  await expect
    .poll(async () => {
      const full = await field.locator(".range-track").boundingBox();
      const current = await fill.boundingBox();
      return Math.abs(full!.width - current!.width);
    })
    .toBeLessThan(1);
  const thumb = await slider.boundingBox();
  const track = await field.locator(".range-track").boundingBox();
  await page.mouse.move(
    thumb!.x + thumb!.width / 2,
    thumb!.y + thumb!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(track!.x + track!.width / 4, track!.y + 25, {
    steps: 12,
  });
  await framed(page, field);
  await page.mouse.up();
  await expect(slider).toHaveAttribute("aria-valuenow", "20");
  await expect(slider).toHaveAttribute("aria-valuetext", "20%");
});

test("motion off makes sliders and segmented controls immediate", async ({
  page,
}) => {
  await page.goto("/demo#/settings");
  await page.getByRole("switch", { name: "Animations", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  const slider = page.getByRole("slider", { name: "Background intensity" });
  await slider.focus();
  await slider.press("End");
  await expect(page.locator(".range-fill")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Offline", exact: true }).click();
  await expect(page.locator(".server-card")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((animation) => animation.playState === "running").length,
      ),
    )
    .toBe(0);
});

test("real game artwork and self-hosted Cyrillic fonts load without ornamental placeholders", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "emberdeck.preferences.v1",
      JSON.stringify({ language: "ru" }),
    ),
  );
  await page.goto("/demo");
  await expect(page.locator(".server-card")).toHaveCount(4);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [
        ...document.querySelectorAll<HTMLImageElement>(
          ".server-cover img, .dashboard-hero-image",
        ),
      ].map(async (image) => {
        image.loading = "eager";
        await image.decode();
      }),
    );
  });
  await expect(
    page.locator(".pixel-motif, .scene-grid, .landscape, .scene-glow"),
  ).toHaveCount(0);
  expect(
    await page
      .locator(".stat-card")
      .first()
      .evaluate((element) => getComputedStyle(element, "::after").content),
  ).toBe("none");
  expect(
    await page.evaluate(() =>
      document.fonts.check('500 16px "Golos Text Variable"', "Ваши серверы"),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      document.fonts.check('650 24px "Manrope Variable"', "Ваши миры"),
    ),
  ).toBe(true);
  await expect(page.locator(".server-cover img")).toHaveCount(4);
  expect(
    await page
      .locator(".server-cover img")
      .evaluateAll((elements) =>
        elements.every(
          (element) =>
            element instanceof HTMLImageElement &&
            element.naturalWidth >= 800 &&
            element.src.endsWith(".webp"),
        ),
      ),
  ).toBe(true);
});

test("all bundled font subsets load under the native panel security policy", async ({
  page,
}) => {
  const source = readFileSync(
    new URL("../../src/web.rs", import.meta.url),
    "utf8",
  );
  const policy = source.match(
    /headers\.insert\("content-security-policy", "([^"]+)"/,
  )?.[1];
  if (!policy) throw new Error("Native Content Security Policy was not found");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/demo", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": policy },
    });
  });
  await page.goto("/demo");
  await expect(page.locator(".server-card")).toHaveCount(4);
  const fonts = await page.evaluate(async () => {
    const faces = [...document.fonts];
    await Promise.all(faces.map((face) => face.load()));
    return faces.map(({ family, status }) => ({ family, status }));
  });
  expect(fonts.some(({ family }) => family.includes("Manrope"))).toBe(true);
  expect(fonts.some(({ family }) => family.includes("Golos Text"))).toBe(true);
  expect(fonts.every(({ status }) => status === "loaded")).toBe(true);
  expect(errors).toEqual([]);
});
