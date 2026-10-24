import { describe, expect, it } from 'vitest';
import { JOBS, JOB_NAMES, jobIdFor, parsePayload } from './index';

const WS = '11111111-1111-4111-8111-111111111111';
const ACC = '22222222-2222-4222-8222-222222222222';

describe('danh mục job', () => {
  it('tên theo quy ước <queue>:<verb> và queue khớp tiền tố', () => {
    for (const name of JOB_NAMES) {
      const [queue] = name.split(':');
      expect(JOBS[name].queue).toBe(queue);
    }
  });

  it('mọi job theo workspace bắt buộc workspaceId', () => {
    for (const name of JOB_NAMES.filter((n) => JOBS[n].workspaceScoped)) {
      const shape = (JOBS[name].schema as unknown as { shape: Record<string, unknown> }).shape;
      expect(shape, name).toHaveProperty('workspaceId');
    }
  });

  it('validate payload khi nhận', () => {
    expect(() =>
      parsePayload('sync:daily_account', { workspaceId: WS, adAccountId: ACC, date: '2026-10-22' }),
    ).not.toThrow();
    expect(() =>
      parsePayload('sync:daily_account', {
        workspaceId: 'x',
        adAccountId: ACC,
        date: '2026-10-22',
      }),
    ).toThrow();
  });

  it('jobId ổn định cho cùng payload (idempotency) và không chứa dấu ":"', () => {
    const p = { workspaceId: WS, adAccountId: ACC, date: '2026-10-22' };
    expect(jobIdFor('sync:daily_account', p)).toBe(jobIdFor('sync:daily_account', { ...p }));
    expect(jobIdFor('sync:daily_account', p)).not.toContain(':');
  });
});
