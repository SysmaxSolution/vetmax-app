import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

/**
 * Lê as variáveis de ambiente do arquivo .env.local na raiz do projeto.
 */
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

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
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Scripts de configuração e limpeza global do banco de dados */
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',

  /* Sobe o servidor Next.js automaticamente antes dos testes */
  webServer: {
    command: 'npm run dev -- --port 4000',
    url: 'http://localhost:4000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});