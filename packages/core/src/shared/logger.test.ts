import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, scrubTokens } from './logger';

function capture() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  const log = createLogger({ level: 'trace', destination });
  return { log, text: () => lines.join('') };
}

const META_TOKEN = 'EAAGm0PX4ZCpsBAKZCZBZCZCxyzABCDEFGHIJKLMNOP123456';

describe('logger không lộ token (CLAUDE.md quy tắc 2)', () => {
  it('che khóa token ở mọi cấp', () => {
    const { log, text } = capture();
    log.info(
      {
        token: META_TOKEN,
        connection: { access_token: META_TOKEN },
        headers: { authorization: 'Bearer abcdefghijklmnop' },
      },
      'kết nối',
    );
    expect(text()).not.toContain(META_TOKEN);
    expect(text()).not.toContain('abcdefghijklmnop');
    expect(text()).toContain('[REDACTED]');
  });

  it('che token lọt vào message và lỗi', () => {
    const { log, text } = capture();
    log.error({ err: new Error(`Meta lỗi với token ${META_TOKEN}`) }, `gọi thất bại ${META_TOKEN}`);
    expect(text()).not.toContain(META_TOKEN);
  });

  it('che thông tin đăng nhập trong URL và token trong query string', () => {
    const { log, text } = capture();
    log.error(
      { err: new Error('connect postgres://admin:hunter2@db.local:5432/x thất bại') },
      'gọi https://graph.facebook.com/v24.0/me?access_token=abc123secret&fields=id',
    );
    expect(text()).not.toContain('hunter2');
    expect(text()).not.toContain('abc123secret');
    expect(text()).toContain('postgres://[REDACTED]@db.local');
  });

  it('không giữ thuộc tính tùy ý của lỗi', () => {
    const { log, text } = capture();
    const err = Object.assign(new Error('x'), {
      config: { headers: { Authorization: 'k-secret' } },
    });
    log.error({ err }, 'lỗi');
    expect(text()).not.toContain('k-secret');
  });

  it('không log body request', () => {
    const { log, text } = capture();
    log.info({ req: { body: { password: 'p@ss-123456' } } }, 'request');
    expect(text()).not.toContain('p@ss-123456');
  });

  it('giữ workspace_id và job_id', () => {
    const { log, text } = capture();
    log.child({ workspace_id: 'ws-1', job_id: 'job-1' }).info('xong');
    expect(text()).toContain('"workspace_id":"ws-1"');
    expect(text()).toContain('"job_id":"job-1"');
  });

  it('scrubTokens che Bearer và EAA', () => {
    expect(scrubTokens(`a ${META_TOKEN} b Bearer xyz.abc-123456`)).toBe('a [REDACTED] b [REDACTED]');
  });
});
