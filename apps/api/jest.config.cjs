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
  coverageDirectory: '<rootDir>/coverage',
  clearMocks: true,
  restoreMocks: true,
};
