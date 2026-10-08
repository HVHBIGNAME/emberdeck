import { expect, test } from "@playwright/test";
import { demoReply } from "../src/demo";

test.use({ locale: "en-US", reducedMotion: "no-preference" });

test("personal preferences persist, synchronize across tabs and keep server names intact", async ({
  page,
  context,
}) => {
  await page.goto("/demo#/settings");
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await page.getByRole("radio", { name: "Moss", exact: true }).check();
  await page.getByRole("combobox", { name: "Interface size" }).click();
  await page.getByRole("option", { name: "Large", exact: true }).click();
  const other = await context.newPage();
  await other.goto("/demo");
  await expect(other.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.bringToFront();
  const language = page.getByRole("combobox", {
    name: "Language",
    exact: true,
  });
  await language.focus();
  await language.press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(
    page.getByRole("option", { name: "English", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("option", { name: "Русский", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("combobox", { name: "Язык" })).toBeFocused();
  await expect(other.locator("html")).toHaveAttribute("lang", "ru");
  await expect(
    other.getByRole("heading", { name: "Ваши миры в надёжных руках." }),
  ).toBeVisible();
  await expect(
    other
      .locator(".server-identity")
      .getByText("Oakheart SMP", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "moss");
  await expect(
    page.getByRole("combobox", { name: "Размер интерфейса" }),
  ).toHaveText("Крупный");
  await page.getByRole("button", { name: "Сбросить оформление" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "ember");
  await expect(page.locator("html")).toHaveAttribute(
    "data-density",
    "comfortable",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await other.close();
});

test("nested selectors handle Escape and dialogs restore focus to their trigger", async ({
  page,
}) => {
  await page.goto("/demo");
  const trigger = page
    .getByRole("button", { name: "New server", exact: true })
    .first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const versions = dialog.getByRole("combobox", {
    name: "Minecraft version",
    exact: true,
  });
  await expect(versions).toBeEnabled();
  await versions.focus();
  await versions.press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).not.toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(versions).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("turning animations off stops CSS and route animations without losing the preference", async ({
  page,
}) => {
  await page.goto("/demo#/settings");
  await expect(page.locator(".scene-photo").first()).toHaveCSS(
    "animation-name",
    "landscape-breathe",
  );
  const toggle = page.getByRole("switch", { name: "Animations", exact: true });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your worlds, in good hands." }),
  ).toBeVisible();
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
  await expect(page.locator(".route-stage")).toHaveCSS("opacity", "1");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
});

test("system theme and reduced-motion changes are respected live", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/demo#/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("switch", { name: "Animations", exact: true }),
  ).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.locator(".focus-cursor")).toHaveCount(0);
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
  await page.emulateMedia({
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  await page.getByRole("radio", { name: "Light", exact: true }).check();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("background images are resized, kept local, persisted and removable", async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/"))
      mutations.push(request.url());
  });
  await page.goto("/demo#/settings");
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2800;
    canvas.height = 1700;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#357961";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const input = page.getByLabel("Choose an image", { exact: true });
  await input.setInputFiles({
    name: "world.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await expect(
    page.getByRole("radio", { name: "Your image", exact: true }),
  ).toBeChecked();
  await expect(page.locator(".scene-custom .scene-image")).toHaveCSS(
    "background-image",
    /data:image\/webp;base64/,
  );
  const size = await page.evaluate(async () => {
    const image = new Image();
    image.src = localStorage.getItem("emberdeck.background.v1")!;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  expect(size.width).toBeLessThanOrEqual(2560);
  expect(size.height).toBeLessThanOrEqual(1600);
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "Your image", exact: true }),
  ).toBeChecked();
  await input.setInputFiles({
    name: "bad.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Choose a PNG, JPEG or WebP",
  );
  await page.getByRole("button", { name: "Remove image", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Your image", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("emberdeck.background.v1")),
  ).toBeNull();
  expect(mutations).toEqual([]);
});

test("invalid stored preferences recover with a visible explanation", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "emberdeck.preferences.v1",
      '{"theme":"unsupported","intensity":"invalid"}',
    ),
  );
  await page.goto("/demo#/settings");
  await expect(page.getByRole("alert")).toContainText(
    "Saved preferences could not be read",
  );
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("blocked storage leaves preferences usable and does not claim they were saved", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("emberdeck."))
        throw new DOMException("Blocked by test", "QuotaExceededError");
      write.call(this, key, value);
    };
  });
  await page.goto("/demo#/settings");
  await expect(page.getByRole("alert")).toContainText(
    "They apply to this tab only",
  );
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toHaveCount(0);
});

test("the overview stays the entry point and installation is in settings", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Your worlds, in good hands." }),
  ).toBeVisible();
  await expect(page.locator('.sidebar a[href="#/install"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "Personal preferences", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Open installation guide", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "One command. Your choice." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Your worlds, in good hands." }),
  ).toBeVisible();
});

test("Russian is detected before sign-in and connection errors remain readable", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "ru-RU" });
  try {
    const page = await context.newPage();
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 401,
        json: { error: "Authentication required" },
      }),
    );
    await page.goto(test.info().project.use.baseURL!);
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(
      page.getByRole("button", { name: "Войти в пространство" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Личные настройки" }).click();
    await expect(page.getByRole("combobox", { name: "Язык" })).toHaveText(
      "Русский",
    );
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 502,
        contentType: "text/html",
        body: "Bad Gateway",
      }),
    );
    await page.goto(test.info().project.use.baseURL!);
    await expect(page.getByRole("alert")).toContainText(
      "Панель или её туннель недоступны (HTTP 502)",
    );
  } finally {
    await context.close();
  }
});

test("library server selection remains usable after choosing Vanilla", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const result = structuredClone(demoReply(url.pathname + url.search));
    if (
      url.pathname === "/api/overview" &&
      result &&
      typeof result === "object" &&
      "servers" in result &&
      Array.isArray(result.servers)
    )
      result.servers[0].template = "vanilla";
    return route.fulfill({ json: result });
  });
  await page.goto("/#/library");
  await expect(
    page.getByRole("heading", { name: "Pure Minecraft", exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Target server" }).click();
  await page.getByRole("option", { name: "Everfrost", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Search packages" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pure Minecraft", exact: true }),
  ).toHaveCount(0);
});
