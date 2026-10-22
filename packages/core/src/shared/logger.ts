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
/** Thông tin đăng nhập trong URL (postgres://user:pass@host, redis://:pass@host). */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]*:[^\s/@]+@/gi;
/** Tham số access_token trong query string. */
const QUERY_TOKEN = /([?&](?:access_token|token|client_secret|appsecret_proof)=)[^&\s"']+/gi;

export function scrubTokens(text: string): string {
  return text
    .replace(TOKEN_LIKE, '[REDACTED]')
    .replace(URL_CREDENTIALS, '$1[REDACTED]@')
    .replace(QUERY_TOKEN, '$1[REDACTED]');
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
        // Lỗi (Error hoặc object đã được pino serialize): chỉ giữ tên, code, message và stack đã
        // che; không giữ thuộc tính tùy ý của lỗi (có thể chứa token, body request).
        const err = obj.err as
          { name?: unknown; code?: unknown; message?: unknown; stack?: unknown } | undefined;
        if (err && typeof err === 'object') {
          return {
            ...obj,
            err: {
              name: typeof err.name === 'string' ? err.name : 'Error',
              code:
                typeof err.code === 'string' || typeof err.code === 'number' ? err.code : undefined,
              message: typeof err.message === 'string' ? scrubTokens(err.message) : undefined,
              stack: typeof err.stack === 'string' ? scrubTokens(err.stack) : undefined,
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
