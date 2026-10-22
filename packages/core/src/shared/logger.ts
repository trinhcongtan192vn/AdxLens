import pino, { type Logger, type LoggerOptions } from 'pino';

export type { Logger };

/**
 * Đường dẫn bị che trong log (L3 mục 11, CLAUDE.md quy tắc 2). Che theo tên khóa ở mọi độ sâu
 * hai cấp; không log object chứa token hay body request.
 */
export const REDACT_PATHS = [
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authorization',
  'password',
  'secret',
  'cookie',
  'body',
  'email',
  '*.token',
  '*.accessToken',
  '*.access_token',
  '*.refreshToken',
  '*.refresh_token',
  '*.authorization',
  '*.Authorization',
  '*.password',
  '*.secret',
  '*.cookie',
  '*.body',
  '*.email',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body',
];

/** Mẫu chuỗi trông như token Meta (EAA…) hoặc Bearer: che cả khi lọt vào message. */
const TOKEN_LIKE = /\b(EAA[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{10,})/g;

export function scrubTokens(text: string): string {
  return text.replace(TOKEN_LIKE, '[REDACTED]');
}

export function createLogger(
  opts: {
    level?: string;
    base?: Record<string, unknown>;
    destination?: pino.DestinationStream;
  } = {},
): Logger {
  const options: LoggerOptions = {
    level: opts.level ?? process.env.LOG_LEVEL ?? 'info',
    base: opts.base ?? null,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    hooks: {
      logMethod(args, method) {
        const scrubbed = args.map((a) =>
          typeof a === 'string' ? scrubTokens(a) : a,
        ) as typeof args;
        method.apply(this, scrubbed);
      },
    },
    formatters: {
      log(obj) {
        // Lỗi: chỉ giữ tên, code, message (đã che) và stack; không giữ thuộc tính tùy ý của lỗi.
        const err = obj.err as (Error & { code?: unknown }) | undefined;
        if (err instanceof Error) {
          return {
            ...obj,
            err: {
              name: err.name,
              code: err.code,
              message: scrubTokens(err.message),
              stack: err.stack ? scrubTokens(err.stack) : undefined,
            },
          };
        }
        return obj;
      },
    },
  };
  return opts.destination ? pino(options, opts.destination) : pino(options);
}

let root: Logger | undefined;
export function rootLogger(): Logger {
  root ??= createLogger();
  return root;
}

/** Logger con luôn gắn workspace_id, job_id (CLAUDE.md quy ước code). */
export function scopedLogger(fields: {
  workspace_id?: string;
  job_id?: string;
  [k: string]: unknown;
}): Logger {
  return rootLogger().child(fields);
}
