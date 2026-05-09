import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

/**
 * Lê as variáveis de ambiente do arquivo .env.local (tenta raiz e vetmax-app/).
 */
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, 'vetmax-app', '.env.local') });

export default defineConfig({
  testDir: './tests/e2e',
  /* Execução serial para evitar conflitos de estado no banco de dados de teste */
  fullyParallel: false,
  /* Falha o build no CI se você esquecer test.only no código */
  forbidOnly: !!process.env.CI,
  /* Repete apenas no CI */
  retries: process.env.CI ? 2 : 0,
  /* Um único worker para garantir que o seed do banco não sofra race conditions */
  workers: 1,
  /* Repórter em lista para o terminal e HTML para análise detalhada */
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  /* Limite de tempo por teste */
  timeout: 30_000,
  
  use: {
    /* URL base onde o seu Next.js está rodando */
    baseURL: process.env.TEST_BASE_URL ?? 'http://localhost:4000',
    /* Coleta rastreamento em caso de falha */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // ── Desktop ────────────────────────────────────────────────────────────────
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // ── Mobile Phones ──────────────────────────────────────────────────────────
    {
      name: 'mobile-iphone-se',
      use: {
        ...devices['iPhone SE'],
        hasTouch: true,
      },
      testMatch: /responsive-mobile\.spec\.ts/,
    },
    {
      name: 'mobile-iphone-12',
      use: {
        ...devices['iPhone 12 Pro'],
        hasTouch: true,
      },
      testMatch: /responsive-mobile\.spec\.ts/,
    },
    {
      name: 'mobile-pixel5',
      use: {
        ...devices['Pixel 5'],
        hasTouch: true,
      },
      testMatch: /responsive-mobile\.spec\.ts/,
    },
    {
      name: 'mobile-samsung-s21',
      use: {
        viewport: { width: 360, height: 800 },
        userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
      testMatch: /responsive-mobile\.spec\.ts/,
    },

    // ── Tablets ────────────────────────────────────────────────────────────────
    {
      name: 'tablet-ipad-mini',
      use: {
        viewport: { width: 768, height: 1024 },
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        isMobile: true,
        hasTouch: true,
      },
      testMatch: /responsive-mobile\.spec\.ts/,
    },
    {
      name: 'tablet-ipad-pro',
      use: {
        viewport: { width: 1024, height: 1366 },
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        isMobile: true,
        hasTouch: true,
      },
      testMatch: /responsive-mobile\.spec\.ts/,
    },
  ],

  /* Scripts de configuração e limpeza global do banco de dados */
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',

  /* Sobe o servidor Next.js automaticamente antes dos testes */
  webServer: {
    command: '.\\vetmax-app\\node_modules\\.bin\\next.cmd dev --turbopack --port 4000',
    url: 'http://localhost:4000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_PATH: path.join(__dirname, 'vetmax-app', 'node_modules'),
    },
  },
});