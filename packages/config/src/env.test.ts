import { describe, expect, it } from 'vitest';
import { EnvError, fullEnvSchema, parseEnv } from './env';

const KEY = Buffer.alloc(32, 7).toString('base64');
const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  INTERNAL_SIGNING_SECRET: 'x'.repeat(32),
  TOKEN_ENC_KEY_V1: KEY,
};

describe('parseEnv', () => {
  it('áp giá trị mặc định cho local', () => {
    const env = parseEnv(fullEnvSchema, valid);
    expect(env.APP_ENV).toBe('local');
    expect(env.META_MOCK).toBe(false);
    expect(env.EXECUTION_ALLOWED_TEST_ACCOUNTS).toEqual([]);
  });

  it('khóa rỗng được coi là chưa cấu hình', () => {
    const env = parseEnv(fullEnvSchema, { ...valid, STRIPE_SECRET_KEY: '  ' });
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it('tách danh sách tài khoản test được phép', () => {
    const env = parseEnv(fullEnvSchema, {
      ...valid,
      EXECUTION_ALLOWED_TEST_ACCOUNTS: 'act_1, act_2,',
    });
    expect(env.EXECUTION_ALLOWED_TEST_ACCOUNTS).toEqual(['act_1', 'act_2']);
  });

  it('khóa xoay vòng V2 để trống được coi là chưa cấu hình', () => {
    expect(
      parseEnv(fullEnvSchema, { ...valid, TOKEN_ENC_KEY_V2: '' }).TOKEN_ENC_KEY_V2,
    ).toBeUndefined();
  });

  it('từ chối khóa mã hóa không đủ 32 byte', () => {
    expect(() => parseEnv(fullEnvSchema, { ...valid, TOKEN_ENC_KEY_V1: 'abc' })).toThrow(EnvError);
  });

  it('thông điệp lỗi không chứa giá trị bí mật', () => {
    const secret = 'super-secret-value-should-not-leak';
    try {
      parseEnv(fullEnvSchema, { ...valid, TOKEN_ENC_KEY_V1: secret });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain('TOKEN_ENC_KEY_V1');
      expect((e as Error).message).not.toContain(secret);
    }
  });
});
