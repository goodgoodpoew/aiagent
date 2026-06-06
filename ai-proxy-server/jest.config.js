const baseConfig = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFiles: ['<rootDir>/test/load-test-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.types.ts',
    '!src/**/interfaces/**',
  ],
};

module.exports = {
  projects: [
    {
      ...baseConfig,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/unit/**/*.spec.ts'],
    },
    {
      ...baseConfig,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/setup.ts', '<rootDir>/test/setup-integration.ts'],
    },
    {
      ...baseConfig,
      displayName: 'e2e',
      testMatch: ['<rootDir>/test/e2e/**/*.spec.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/setup.ts', '<rootDir>/test/setup-integration.ts'],
    },
  ],
  coverageDirectory: '<rootDir>/coverage',
};
