import { expect, test } from "@playwright/test";
import { releaseTag } from "../src/installation";

test("install wizard produces copyable quick and token-based commands", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/demo#/install");
  await expect(
    page.getByRole("heading", { name: "One command. Your choice." }),
  ).toBeVisible();
  const command = page.getByLabel("Installation command");
  await expect(command).toContainText(`--version '${releaseTag}'`);
  await expect(command).toContainText("--access 'quick'");
  await page.getByRole("button", { name: "Copy install command" }).click();
  await expect(
    page.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    await command.innerText(),
  );
  await page.getByRole("radio", { name: /^Cloudflare Tunnel/ }).check();
  await expect(page.getByRole("alert")).toContainText("HTTPS URL");
  await page.getByLabel("Public HTTPS URL").fill("https://panel.example.com");
  await page
    .getByLabel("Connector token file (optional)")
    .fill("/root/connector's token.txt");
  await expect(command).toContainText(
    "--public-url 'https://panel.example.com'",
  );
  await expect(command).toContainText(
    "--tunnel-token-file '/root/connector'\\''s token.txt'",
  );
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("installation profiles validate URLs and ports and support agent-only setup", async ({
  page,
}) => {
  await page.goto("/demo#/install");
  await page.getByRole("radio", { name: /^Managed HTTPS/ }).check();
  await page
    .getByLabel("Public HTTPS URL")
    .fill("https://panel.example.com/subpath");
  await expect(page.getByRole("alert")).toContainText("without credentials");
  await expect(
    page.getByRole("button", { name: "Copy install command" }),
  ).toHaveCount(0);
  await page.getByLabel("Public HTTPS URL").fill("https://panel.example.com");
  await expect(page.getByLabel("Installation command")).toContainText(
    "--access 'caddy'",
  );
  await page
    .getByText("Ports & game connection address", { exact: true })
    .click();
  await page.getByLabel("Panel port", { exact: true }).fill("2022");
  await expect(page.getByRole("alert")).toContainText("different ports");
  await page.getByLabel("Panel port", { exact: true }).fill("18080");
  await expect(page.getByLabel("Installation command")).toContainText(
    "--panel-port 18080",
  );
  await page.getByRole("combobox", { name: "Components", exact: true }).click();
  await page
    .getByRole("option", { name: "Minecraft node only · connect to a panel" })
    .click();
  await expect(page.getByLabel("Installation command")).toContainText(
    "--mode 'agent'",
  );
  await expect(page.getByLabel("Installation command")).not.toContainText(
    "--access",
  );
  await expect(page.getByRole("radio")).toHaveCount(0);
});

test("the installation guide is accessible before sign-in", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 401, json: { error: "Authentication required" } }),
  );
  await page.goto("/");
  await page.getByRole("link", { name: "Install on another host" }).click();
  await expect(
    page.getByRole("heading", { name: "One command. Your choice." }),
  ).toBeVisible();
  await expect(page.getByLabel("Installation command")).toContainText(
    "sudo bash",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("proxy failures produce a readable connection error", async ({ page }) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 502,
      contentType: "text/html",
      body: "<h1>Bad Gateway</h1>",
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "access tunnel is unavailable (HTTP 502)",
  );
  await expect(page.getByRole("alert")).not.toContainText("Unexpected token");
});
