import { defineConfig } from "@playwright/test";
// Needs the full local stack: anvil (:8545) with DeployLocal applied, server (:8080) and web (:3000)
// built with NEXT_PUBLIC_CHAIN_ID=31337 and NEXT_PUBLIC_DEV_KEY set to the same key as E2E_DEV_KEY.
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
