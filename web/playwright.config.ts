import { defineConfig, devices } from "@playwright/test";
// Assumes anvil (:8545), server (:8080) and web (:3000) are already running: `pnpm anvil`, `pnpm dev`.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3000", screenshot: "on", trace: "retain-on-failure" },
  outputDir: "../out/shots",
  projects: [
    { name: "phone", use: { ...devices["iPhone 13"] } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
