import { validateEnvironment } from '../src/config/environment';

describe('validateEnvironment', () => {
  const validSource = {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/support?schema=public',
  };

  it('applies safe runtime defaults and parses PORT as a number', () => {
    expect(validateEnvironment({ ...validSource, PORT: '3100' })).toEqual({
      ...validSource,
      NODE_ENV: 'development',
      PORT: 3100,
    });
  });

  it('rejects non-PostgreSQL database URLs', () => {
    expect(() =>
      validateEnvironment({ ...validSource, DATABASE_URL: 'mysql://localhost/db' }),
    ).toThrow('DATABASE_URL must be a PostgreSQL connection URL');
  });

  it('rejects invalid ports and missing database URLs without exposing values', () => {
    expect(() => validateEnvironment({ PORT: '70000', DATABASE_URL: '' })).toThrow(
      'PORT must be an integer between 1 and 65535; DATABASE_URL is required',
    );
  });
});
