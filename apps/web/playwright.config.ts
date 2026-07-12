import { defineConfig } from '@playwright/test';

// e2e는 vite dev 서버로 돌린다. 프리뷰(빌드 산출물)는 패키지 원본 모듈을 서빙하지 않아
// 브라우저에서 새니타이저를 직접 import해 검증할 수 없다 — XSS 테스트가 '모듈 로드 실패'로
// 조용히 죽는다(실제로 그렇게 죽어 있었다). dev 서버는 /@fs/ 경로로 소스를 서빙한다.
export default defineConfig({
  testDir:'./e2e',timeout:60_000,fullyParallel:false,
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure'},
  webServer:{command:'pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:true,timeout:120_000},
  projects:[{name:'chromium',use:{browserName:'chromium'}}]
});
