import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',outputDir:'./artifacts/playwright',workers:1,timeout:45000,
  use:{channel:'msedge',headless:true,viewport:{width:1600,height:1000},launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
  webServer:{command:'npm run dev -- --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:false,timeout:30000},
});
