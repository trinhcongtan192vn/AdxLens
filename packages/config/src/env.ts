import { z } from 'zod';

/**
 * Biến môi trường được validate bằng zod khi khởi động (implementation-guide B0 mục 6).
 * Khóa dịch vụ ngoài là tùy chọn ở local: tính năng tương ứng tự chuyển sang chế độ mock/mẫu.
 */

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v));

const base64Key32 = z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'phải là 32 byte mã hóa base64');

export const baseEnvSchema = z.object({
  APP_ENV: z.enum(['local', 'test', 'staging', 'production']).default('local'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  /** Phiên bản bản deploy (git sha) — checklist cờ P2a đòi test tích hợp ghi đạt cho đúng phiên bản này. */
  APP_VERSION: z.string().default('local'),
  PUBLIC_REPORT_URL: z.string().url().default('http://localhost:3000/r'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
  SUPABASE_URL: z.string().url().default('http://127.0.0.1:54321'),
  SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  /** Địa chỉ công khai của Supabase cho link logo / PDF (dev công khai qua tunnel). Trống = dùng SUPABASE_URL. */
  STORAGE_PUBLIC_URL: optionalString,
  INTERNAL_SIGNING_SECRET: z.string().min(32),
  SENTRY_DSN: optionalString,
  POSTHOG_KEY: optionalString,
});

export const metaEnvSchema = z.object({
  META_APP_ID: optionalString,
  META_APP_SECRET: optionalString,
  META_API_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default('v24.0'),
  /** Chỉ dùng ở local/test: thay Meta thật bằng dữ liệu giả để chạy luồng không cần app Meta. */
  META_MOCK: z
    .enum(['0', '1'])
    .default('0')
    .transform((v) => v === '1'),
});

export const tokenEnvSchema = z.object({
  TOKEN_ENC_KEY_V1: base64Key32,
  TOKEN_ENC_KEY_V2: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    base64Key32.optional(),
  ),
});

export const integrationsEnvSchema = z.object({
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
  EMAIL_FROM: z.string().default('AdxLens <no-reply@adxlens.local>'),
  RESEND_API_KEY: optionalString,
  SMTP_HOST: z.string().default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().default(54325),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  /** Kênh báo đội AdxLens cho sự cố P1/P2 (043): email cách nhau dấu phẩy, Slack incoming webhook. */
  OPS_ALERT_EMAILS: optionalString,
  OPS_SLACK_WEBHOOK_URL: optionalString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_PUBLISHABLE_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  PAYOS_CLIENT_ID: optionalString,
  PAYOS_API_KEY: optionalString,
  PAYOS_CHECKSUM_KEY: optionalString,
  /** Danh sách act_ID được phép chạy test tích hợp ghi (P2). Rỗng = không cho chạy. */
  EXECUTION_ALLOWED_TEST_ACCOUNTS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
});

export const fullEnvSchema = baseEnvSchema.extend({
  ...metaEnvSchema.shape,
  ...tokenEnvSchema.shape,
  ...integrationsEnvSchema.shape,
});

export type FullEnv = z.infer<typeof fullEnvSchema>;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Biến môi trường không hợp lệ:\n${issues.join('\n')}`);
    this.name = 'EnvError';
  }
}

/** Parse và trả lỗi chỉ nêu TÊN biến, không bao giờ in giá trị (có thể là bí mật). */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined> = process.env,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`);
    throw new EnvError(issues);
  }
  return result.data;
}

let cached: FullEnv | undefined;

/** Env đầy đủ cho server (web route handler và worker). Cache sau lần đọc đầu. */
export function getEnv(): FullEnv {
  cached ??= parseEnv(fullEnvSchema);
  return cached;
}

/** Chỉ dùng trong test. */
export function resetEnvCache(): void {
  cached = undefined;
}
