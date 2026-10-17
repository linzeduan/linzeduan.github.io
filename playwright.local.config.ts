import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/local",
  outputDir: "./test-results/local",
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4175", trace: "retain-on-failure" },
  projects: [
    { name: "local-desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "local-mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "node scripts/test-local-ui.mjs",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
  },
});
