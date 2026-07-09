import type { Config } from 'jest'

/**
 * Config dedicada da bateria de segurança (tests/security/).
 * Diferente de jest.config.ts: NÃO conecta ao banco (sem globalSetup/teardown),
 * para poder rodar em CI como gate de segurança sem credenciais do Supabase.
 * As guardas são estáticas — leem o código-fonte e o índice do git.
 */
const config: Config = {
  testEnvironment: 'node',
  testMatch: ['**/tests/security/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.claude/worktrees/', '/.next/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.test.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testTimeout: 30000,
  maxWorkers: 1,
}

export default config
