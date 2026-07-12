import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./e2e',timeout:30_000,fullyParallel:false,
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure'},
  webServer:{command:'pnpm build && pnpm exec vite preview --host 127.0.0.1',url:'http://127.0.0.1:4173',reuseExistingServer:false,timeout:120_000},
  projects:[{name:'chromium',use:{browserName:'chromium'}}]
});
