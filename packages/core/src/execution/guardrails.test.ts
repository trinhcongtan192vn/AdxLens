import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  checkGuardrails,
  effectiveGuardrails,
  GUARDRAIL_DEFAULTS,
  inQuietHours,
  saveGuardrails,
  tighterViolations,
  type Guardrails,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const defaults = (): Guardrails => ({ ...GUARDRAIL_DEFAULTS, excludeMetaIds: [] });

describe('guardrails mặc định — KHÓA (ADR-0001 A7, CLAUDE.md quy tắc 6)', () => {
  it('đúng giá trị PM chốt; đổi giá trị này cần task + ADR', () => {
    expect(GUARDRAIL_DEFAULTS).toEqual({
      maxBudgetChangePct: '15.00',
      maxActionsPerDay: 5,
      minDataDays: 3,
      quietStartHour: 22,
      quietEndHour: 6,
      breakerFailures: 3,
      excludeMetaIds: [],
    });
    expect(Object.isFrozen(GUARDRAIL_DEFAULTS)).toBe(true);
    expect(tighterViolations(defaults())).toEqual([]);
  });

  it('không cho nới lỏng bất kỳ trường nào', () => {
    const loose: Partial<Guardrails>[] = [
      { maxBudgetChangePct: '15.01' },
      { maxBudgetChangePct: '0' },
      { maxActionsPerDay: 6 },
      { maxActionsPerDay: 0 },
      { minDataDays: 2 },
      { quietStartHour: 23 },
      { quietEndHour: 5 },
      { breakerFailures: 4 },
    ];
    for (const l of loose) expect(tighterViolations({ ...defaults(), ...l }), JSON.stringify(l)).not.toEqual([]);
    expect(
      tighterViolations({
        ...defaults(),
        maxBudgetChangePct: '10',
        maxActionsPerDay: 3,
        minDataDays: 7,
        quietStartHour: 20,
        quietEndHour: 8,
        breakerFailures: 2,
      }),
    ).toEqual([]);
  });
});

describe('kiểm guardrails cho một hành động', () => {
  const base = {
    guardrails: defaults(),
    actionType: 'pause_ad' as const,
    tier: 'approve' as const,
    targetIds: ['111', '222'],
    accountTimezone: 'Asia/Ho_Chi_Minh',
    now: new Date('2026-10-23T03:00:00Z'), // 10:00 giờ VN
    actionsToday: 0,
    dataDays: 10,
  };

  it('hợp lệ → không vi phạm', () => {
    expect(checkGuardrails(base)).toEqual([]);
  });

  it('ngân sách: ±15% là biên; 15,01% bị chặn; không có ngân sách ngày → chặn', () => {
    const b = { ...base, actionType: 'set_adset_budget' as const, currentDailyBudget: '1000000' };
    expect(checkGuardrails({ ...b, newDailyBudget: '1150000' })).toEqual([]);
    expect(checkGuardrails({ ...b, newDailyBudget: '850000' })).toEqual([]);
    expect(checkGuardrails({ ...b, newDailyBudget: '1150100' }).map((x) => x.code)).toEqual([
      'budget_change_too_large',
    ]);
    expect(checkGuardrails({ ...b, newDailyBudget: '849999' }).map((x) => x.code)).toEqual(['budget_change_too_large']);
    expect(checkGuardrails({ ...b, currentDailyBudget: null, newDailyBudget: '1' }).map((x) => x.code)).toEqual([
      'no_daily_budget',
    ]);
  });

  it('số hành động/ngày, dữ liệu tối thiểu, danh sách loại trừ (kể cả cấp cha)', () => {
    expect(checkGuardrails({ ...base, actionsToday: 5 }).map((x) => x.code)).toEqual(['too_many_actions']);
    expect(checkGuardrails({ ...base, dataDays: 2 }).map((x) => x.code)).toEqual(['not_enough_data']);
    expect(
      checkGuardrails({ ...base, guardrails: { ...defaults(), excludeMetaIds: ['222'] } }).map((x) => x.code),
    ).toEqual(['excluded']);
  });

  it('tự chạy: chặn 22:00–06:00 giờ tài khoản, chặn tự bật lại và tự nhân bản; duyệt tay thì không chặn giờ', () => {
    const night = new Date('2026-10-23T16:30:00Z'); // 23:30 giờ VN
    expect(checkGuardrails({ ...base, tier: 'auto', now: night }).map((x) => x.code)).toEqual(['quiet_hours']);
    expect(checkGuardrails({ ...base, now: night })).toEqual([]);
    expect(checkGuardrails({ ...base, tier: 'auto', actionType: 'resume_ad' }).map((x) => x.code)).toEqual([
      'no_auto_resume',
    ]);
    expect(checkGuardrails({ ...base, tier: 'auto', actionType: 'duplicate_adset' }).map((x) => x.code)).toEqual([
      'no_auto_duplicate',
    ]);
    expect(inQuietHours(22, 22, 6)).toBe(true);
    expect(inQuietHours(5, 22, 6)).toBe(true);
    expect(inQuietHours(6, 22, 6)).toBe(false);
  });
});

describe('cấu hình guardrails của workspace (P205)', () => {
  it('chưa cấu hình → mặc định; Owner đặt chặt hơn; nới lỏng bị từ chối', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
    expect(await effectiveGuardrails(ctx)).toMatchObject({ ...defaults(), configured: false });
    await saveGuardrails(ctx, { ...defaults(), maxBudgetChangePct: '10', excludeMetaIds: ['123', '123'] });
    expect(await effectiveGuardrails(ctx)).toMatchObject({ maxBudgetChangePct: '10.00', excludeMetaIds: ['123'] });
    await expect(saveGuardrails(ctx, { ...defaults(), maxActionsPerDay: 10 })).rejects.toMatchObject({
      code: 'GUARDRAIL_VIOLATION',
    });
  });

  it('dòng DB bị sửa tay thành lỏng hơn → vẫn dùng mặc định cho trường đó', async () => {
    const { workspace } = await seedWorkspace(db);
    await db.insert(schema.guardrailSettings).values({
      workspaceId: workspace.id,
      maxBudgetChangePct: '50',
      maxActionsPerDay: 100,
      minDataDays: 0,
      quietStartHour: 23,
      quietEndHour: 4,
      breakerFailures: 10,
      excludeMetaIds: [],
    });
    expect(await effectiveGuardrails({ db, workspaceId: workspace.id })).toMatchObject({
      ...defaults(),
      configured: true,
    });
  });

  it('chỉ Owner; workspace khác không bị ảnh hưởng', async () => {
    const a = await seedWorkspace(db);
    const b = await seedWorkspace(db);
    const m = await seedMember(db, a.workspace.id, 'manager');
    const mctx = { db, workspaceId: a.workspace.id, actor: (await resolveActor(db, a.workspace.id, m.id))! };
    await expect(saveGuardrails(mctx, defaults())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const actx = { db, workspaceId: a.workspace.id, actor: (await resolveActor(db, a.workspace.id, a.owner.id))! };
    await saveGuardrails(actx, { ...defaults(), maxActionsPerDay: 2 });
    expect((await effectiveGuardrails({ db, workspaceId: b.workspace.id })).maxActionsPerDay).toBe(5);
  });
});
