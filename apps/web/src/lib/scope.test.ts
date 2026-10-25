import { describe, expect, it } from 'vitest';
import { clientNav, clientScopeOf, isClientNavActive, pickScope } from './scope';

const C = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
const flags = { p0_reports: true, p1_recommendations: false, p2a_approve: false, p2b_auto: false };

describe('phạm vi Client (G3)', () => {
  it('nhận Client từ đường dẫn, ?client= hoặc tài khoản thuộc Client; còn lại là phạm vi agency', () => {
    expect(clientScopeOf(`/clients/${C}`, '', {})).toBe(C);
    expect(clientScopeOf(`/clients/${C}/reconciliation`, '', {})).toBe(C);
    expect(clientScopeOf('/weekly-actions', `?client=${C}`, {})).toBe(C);
    expect(clientScopeOf(`/accounts/${A}/campaign/123`, '', { [A]: C })).toBe(C);
    expect(clientScopeOf(`/accounts/${A}`, '', { [A]: null })).toBeNull();
    expect(clientScopeOf('/overview', '?client=not-a-uuid', {})).toBeNull();
    expect(clientScopeOf('/clients', '', {})).toBeNull();
  });

  it('mục theo cờ và vai trò; mục đang chọn theo tab (mặc định chiến dịch)', () => {
    const owner = clientNav(C, flags, 'owner').map((i) => i.key);
    expect(owner).toEqual(['campaigns', 'adsets', 'ads', 'reconciliation', 'reports', 'clientSettings']);
    expect(clientNav(C, flags, 'buyer').map((i) => i.key)).not.toContain('reports');
    const all = clientNav(
      C,
      { p0_reports: true, p1_recommendations: true, p2a_approve: true, p2b_auto: true },
      'owner',
    );
    expect(all.map((i) => i.key)).toContain('automation');
    const campaigns = all.find((i) => i.key === 'campaigns')!;
    expect(isClientNavActive(campaigns, `/clients/${C}`, '')).toBe(true);
    expect(isClientNavActive(campaigns, `/clients/${C}`, '?tab=ads')).toBe(false);
    const weekly = all.find((i) => i.key === 'weeklyActions')!;
    expect(isClientNavActive(weekly, '/weekly-actions', `?client=${C}`)).toBe(true);
  });
});

describe('pickScope (một bộ chọn Client)', () => {
  const acc = (id: string, clientId: string | null, currency = 'VND') => ({ id, clientId, currency });
  const all = [acc('a1', 'c1'), acc('a2', 'c1', 'USD'), acc('a3', 'c2'), acc('a4', null)];
  it('Client đang xem lọc tài khoản; Client lạ → mọi Client', () => {
    expect(pickScope(all, 'c1', undefined).accounts.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(pickScope(all, 'c9', undefined)).toMatchObject({ clientId: null });
    expect(pickScope(all, undefined, undefined).accounts).toHaveLength(4);
  });
  it('tài khoản chọn phải thuộc Client đang xem; không chọn → cùng tiền tệ chính', () => {
    expect(pickScope(all, 'c1', 'a3').selected).toBeNull();
    expect(pickScope(all, 'c1', 'a2').inScope.map((a) => a.id)).toEqual(['a2']);
    expect(pickScope(all, undefined, undefined).inScope.map((a) => a.id)).toEqual(['a1', 'a3', 'a4']);
  });
});
