import { defineConfig, devices } from "@playwright/test";

const chromiumExecutablePath = process.env.GAMETESTLAB_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    viewport: { width: 960, height: 640 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(chromiumExecutablePath
          ? { launchOptions: { executablePath: chromiumExecutablePath } }
          : {})
      }
    }
  ],
  webServer: {
    command: "pnpm run demo:serve",
    url: "http://127.0.0.1:4173/healthz",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
