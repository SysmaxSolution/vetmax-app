import type { Config } from 'jest';
import dotenv from 'dotenv';
import path from 'path';

// Carregamento imediato das variáveis de ambiente para o processo do Jest
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const config: Config = {
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.ts', '**/tests/integration/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.claude/worktrees/', '/.next/'],
  transform: { 
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.test.json' }] 
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // O setupFiles garante que o dotenv rode em cada worker de teste
  setupFiles: ['<rootDir>/tests/jest-setup.ts'],
  // O globalSetup roda uma única vez antes de todos os testes (onde o erro ocorria)
  globalSetup: '<rootDir>/tests/jest-global-setup.ts',
  globalTeardown: '<rootDir>/tests/jest-global-teardown.ts',
  testTimeout: 30000,
  maxWorkers: 1, // Mantido em 1 para evitar conflitos no banco de dados
};

export default config;