import { expect, test } from "@playwright/test";
import { demoReply } from "../src/demo";

test("overview reflects the demo fleet and filters server states", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Your worlds, in good hands." }),
  ).toBeVisible();
  await expect(page.locator(".server-card")).toHaveCount(4);
  await page
    .locator(".servers-section")
    .getByRole("button", { name: "Offline", exact: true })
    .click();
  await expect(page.locator(".server-card")).toHaveCount(1);
  await expect(page.locator(".server-card")).toContainText(
    "Deepslate Adventures",
  );
  await page
    .locator(".servers-section")
    .getByRole("button", { name: "Online", exact: true })
    .click();
  await expect(page.locator(".server-card")).toHaveCount(3);
  await expect(page.getByText("DEMO WORKSPACE · SAMPLE DATA")).toBeVisible();
});

test("keyboard search navigates to the right server and package type", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.locator(".server-card")).toHaveCount(4);
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("textbox", { name: "Search servers" }),
  ).toBeFocused();
  await page.getByRole("textbox", { name: "Search servers" }).fill("Everfrost");
  await page
    .locator(".search-results")
    .getByRole("button", { name: /Everfrost/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Everfrost", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Mods", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/servers\/everfrost$/);
});

test("resource history can be explored with the keyboard", async ({ page }) => {
  await page.goto("/demo#/servers/oakheart");
  const history = page.getByRole("slider", { name: "% CPU history" });
  await history.focus();
  await history.press("Home");
  await expect(history).toHaveValue("0");
  await expect(history).toHaveAttribute("aria-valuetext", /% CPU at/);
  await history.press("ArrowRight");
  await expect(history).toHaveValue("1");
  await expect(page.locator(".chart-tooltip")).toBeVisible();
});

test("successful saves preserve the editor during a workspace refresh", async ({
  page,
}) => {
  let file = {
    path: "server.properties",
    content: "motd=Before the edit\n",
    encoding: "utf8",
    sha256: "initial-revision",
    size: 21,
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.endsWith("/actions")) {
      const body: unknown = request.postDataJSON();
      if (
        typeof body === "object" &&
        body !== null &&
        "action" in body &&
        body.action === "write_file" &&
        "content" in body &&
        typeof body.content === "string"
      ) {
        file = { ...file, content: body.content, sha256: "saved-revision" };
        await route.fulfill({ json: { saved: true } });
        return;
      }
    }
    await route.fulfill({
      json: url.pathname.endsWith("/file")
        ? file
        : demoReply(url.pathname + url.search),
    });
  });
  await page.goto("/#/servers/oakheart/files");
  await page
    .getByRole("button", { name: "server.properties", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "File contents" });
  await editor.fill("motd=Saved through the editor\n");
  const save = page.getByRole("button", { name: "Save", exact: true });
  await save.click();
  await expect(page.getByRole("status")).toContainText("Change saved.");
  await expect(save).toBeDisabled();
  await expect(editor).toHaveValue("motd=Saved through the editor\n");
});

test("create wizard requires EULA consent and demo cannot deploy", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "New server", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "A new world is waiting." }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByLabel("Server name", { exact: true }).fill("Test world");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  const launch = dialog.getByRole("button", {
    name: "Create server",
    exact: true,
  });
  await expect(launch).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: /I have read and accept/ })
    .check();
  await launch.click();
  await expect(dialog.getByRole("alert")).toContainText("read-only demo");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".server-card")).toHaveCount(4);
});

test("files, packages and automation controls remain read-only in demo", async ({
  page,
}) => {
  await page.goto("/demo#/servers/oakheart/files");
  await page
    .getByRole("button", { name: "server.properties", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "File contents" }),
  ).toHaveValue(/motd=A little place/);
  await page
    .getByRole("textbox", { name: "File contents" })
    .fill("motd=an unsaved demo edit");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("read-only demo");
  await page.getByRole("tab", { name: "Plugins", exact: true }).click();
  const enabled = page.getByRole("switch").first();
  await expect(enabled).toBeChecked();
  await enabled.click();
  await expect(enabled).toBeChecked();
  await page.getByRole("tab", { name: "Automations", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A quiet-world backup" }),
  ).toBeVisible();
});

test("all views render without browser errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of [
    "/overview",
    "/library",
    "/blueprints",
    "/automations",
    "/backups",
    "/nodes",
    "/access",
    "/activity",
    "/servers/oakheart/console",
    "/servers/oakheart/diagnostics",
    "/servers/oakheart/settings",
  ]) {
    await page.goto(`/demo#${route}`);
    await expect(page.locator(".main-content")).toBeVisible();
    await expect(page.locator(".main-content .loading")).toHaveCount(0);
    await expect(page.locator(".main-content > .error-box")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("mobile layout stays within the viewport and navigation works", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  await expect(page.locator(".server-card")).toHaveCount(4);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A world of possibilities." }),
  ).toBeVisible();
  await expect(page.locator(".sidebar")).not.toHaveClass(/mobile-open/);
});
