/** @type {import('jest').Config} */
module.exports = {
  displayName: 'api-unit',
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/main.ts',
    '!<rootDir>/src/generated/**',
  ],
  // Piso de regressão baseado no baseline atual; a meta de produto continua sendo 80%.
  coverageThreshold: {
    global: {
      branches: 37,
      functions: 43,
      lines: 46,
      statements: 45,
    },
  },
  coverageDirectory: '<rootDir>/coverage',
  clearMocks: true,
  restoreMocks: true,
};
