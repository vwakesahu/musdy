import { defineConfig } from "@playwright/test";
// needs the full local stack: anvil with DeployLocal, server on :8080, web on :3000 built for chain 31337
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  workers: 1,
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3000", screenshot: "only-on-failure", trace: "retain-on-failure" },
  outputDir: "../out/test-results",
  projects: [
    { name: "phone", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
  ],
});
