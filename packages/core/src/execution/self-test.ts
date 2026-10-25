import type { MetaWriteApi } from '@adxlens/meta-client/write';
import { minorUnits } from './gateway';

export type SelfTestStep = { action: string; target: string; ok: boolean; detail: string };

/**
 * Test tích hợp lớp ghi trên tài khoản Meta TEST (L3 14, ADR-0008 mục 9): mỗi `action_type` ghi → đọc lại →
 * trả về như cũ. CHỈ chạy với tài khoản trong danh sách cho phép; đối tượng thuộc tài khoản khác → dừng,
 * không ghi gì. Bản sao từ nhân bản để lại ở trạng thái PAUSED (báo id để xóa tay).
 */
export async function runWriteSelfTest(
  writer: MetaWriteApi,
  token: string,
  input: { allowedAccounts: string[]; adId: string; adsetId: string },
): Promise<SelfTestStep[]> {
  const allowed = new Set(input.allowedAccounts.map((a) => a.replace(/^act_/, '')));
  if (!allowed.size) throw new Error('Thiếu META_WRITE_TEST_ACCOUNTS — không chạy');
  const ad = await writer.getObject(token, input.adId, 'ad');
  const adset = await writer.getObject(token, input.adsetId, 'adset');
  for (const o of [ad, adset]) {
    if (!o.account_id || !allowed.has(o.account_id)) {
      throw new Error(`Đối tượng ${o.id} không thuộc tài khoản test cho phép — không ghi gì`);
    }
  }
  const steps: SelfTestStep[] = [];
  const check = async (action: string, target: string, fn: () => Promise<boolean>, detail: string) => {
    try {
      steps.push({ action, target, ok: await fn(), detail });
    } catch (e) {
      steps.push({ action, target, ok: false, detail: e instanceof Error ? e.message : 'lỗi' });
    }
  };

  // pause_ad / resume_ad (giữ nguyên trạng thái gốc khi kết thúc).
  const adStatus = ad.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE';
  const adOther = adStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
  await check(
    `${adOther === 'PAUSED' ? 'pause' : 'resume'}_ad`,
    ad.id,
    async () => {
      await writer.setStatus(token, ad.id, adOther);
      return (await writer.getObject(token, ad.id, 'ad')).status === adOther;
    },
    adOther,
  );
  await check(
    `${adStatus === 'PAUSED' ? 'pause' : 'resume'}_ad (trả lại)`,
    ad.id,
    async () => {
      await writer.setStatus(token, ad.id, adStatus);
      return (await writer.getObject(token, ad.id, 'ad')).status === adStatus;
    },
    adStatus,
  );

  // pause_adset / resume_adset.
  const asStatus = adset.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE';
  const asOther = asStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
  await check(
    `${asOther === 'PAUSED' ? 'pause' : 'resume'}_adset`,
    adset.id,
    async () => {
      await writer.setStatus(token, adset.id, asOther);
      return (await writer.getObject(token, adset.id, 'adset')).status === asOther;
    },
    asOther,
  );
  await check(
    `${asStatus === 'PAUSED' ? 'pause' : 'resume'}_adset (trả lại)`,
    adset.id,
    async () => {
      await writer.setStatus(token, adset.id, asStatus);
      return (await writer.getObject(token, adset.id, 'adset')).status === asStatus;
    },
    asStatus,
  );

  // set_adset_budget +5% rồi trả lại.
  const cur = minorUnits(adset.daily_budget ?? null);
  if (cur) {
    const next = String((BigInt(cur) * 105n) / 100n);
    await check(
      'set_adset_budget',
      adset.id,
      async () => {
        await writer.setDailyBudget(token, adset.id, next);
        return minorUnits((await writer.getObject(token, adset.id, 'adset')).daily_budget ?? null) === next;
      },
      `${cur} → ${next}`,
    );
    await check(
      'set_adset_budget (trả lại)',
      adset.id,
      async () => {
        await writer.setDailyBudget(token, adset.id, cur);
        return minorUnits((await writer.getObject(token, adset.id, 'adset')).daily_budget ?? null) === cur;
      },
      cur,
    );
  } else {
    steps.push({ action: 'set_adset_budget', target: adset.id, ok: false, detail: 'ad set không có ngân sách ngày' });
  }

  // duplicate_adset: bản sao phải PAUSED.
  let copyId = '';
  await check(
    'duplicate_adset',
    adset.id,
    async () => {
      copyId = (await writer.copyAdSet(token, adset.id)).copiedAdSetId;
      return (await writer.getObject(token, copyId, 'adset')).status === 'PAUSED';
    },
    'bản sao PAUSED',
  );
  if (copyId) steps[steps.length - 1]!.detail = `bản sao ${copyId} (PAUSED) — xóa tay trên Ads Manager`;
  return steps;
}
