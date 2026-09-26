import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/live",
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    headless: true,
  },
  workers: 1,
  reporter: "list",
  timeout: 60000,
});
