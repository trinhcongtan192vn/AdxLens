/**
 * Meta GHI giả (META_MOCK=1, local/test): ghi vào `mockWriteState` để `MockMetaRead` đọc lại được. Có
 * cài lỗi theo kịch bản cho test gateway: lỗi trước khi áp, lỗi sau khi đã áp (Meta đã đổi nhưng trả lỗi),
 * và áp sai giá trị (verify không khớp). Chỉ `packages/core/execution` import (ranh giới `write`).
 */
import { MetaApiError } from './errors';
import { MOCK_ACCOUNTS, mockStructure, mockWriteState } from './mock';
import type { MetaObjectType, MetaWriteApi, WritableObject } from './write';

export type MockWriteFault = 'error_before' | 'error_after' | 'wrong_value';

export class MockMetaWrite implements MetaWriteApi {
  /** Lỗi cài cho lần gọi ghi tiếp theo (rồi tự xóa). */
  private fault: MockWriteFault | null = null;
  readonly calls: { op: string; id: string; value?: string }[] = [];

  failNext(f: MockWriteFault): void {
    this.fault = f;
  }

  private find(id: string): { obj: WritableObject; type: MetaObjectType } | null {
    for (const a of MOCK_ACCOUNTS) {
      const s = mockStructure(a.id);
      const adset = s.adsets.find((x) => x.id === id);
      if (adset) {
        return {
          type: 'adset',
          obj: {
            id: adset.id,
            name: adset.name,
            status: adset.status,
            effective_status: adset.effective_status,
            daily_budget: adset.daily_budget,
            lifetime_budget: adset.lifetime_budget,
            campaign_id: adset.campaign_id,
            account_id: a.id.replace(/^act_/, ''),
          },
        };
      }
      const ad = s.ads.find((x) => x.id === id);
      if (ad) {
        return {
          type: 'ad',
          obj: {
            id: ad.id,
            name: ad.name,
            status: ad.status,
            effective_status: ad.effective_status,
            adset_id: ad.adset_id,
            campaign_id: ad.campaign_id,
            account_id: a.id.replace(/^act_/, ''),
          },
        };
      }
    }
    return null;
  }

  async getObject(_t: string, id: string, type: MetaObjectType) {
    const f = this.find(id);
    if (!f || f.type !== type)
      throw new MetaApiError(400, 100, 33, 'GraphMethodException', 'Object does not exist', null);
    return f.obj;
  }

  private apply(id: string, patch: { status?: string; daily_budget?: string }) {
    const fault = this.fault;
    this.fault = null;
    if (fault === 'error_before')
      throw new MetaApiError(500, 2, null, 'OAuthException', 'Service temporarily unavailable', null);
    const wrong = fault === 'wrong_value';
    const value = wrong
      ? { status: patch.status ? 'ARCHIVED' : undefined, daily_budget: patch.daily_budget ? '1' : undefined }
      : patch;
    const cur = mockWriteState.overrides.get(id) ?? {};
    mockWriteState.overrides.set(id, {
      ...cur,
      ...(value.status ? { status: value.status } : {}),
      ...(value.daily_budget ? { daily_budget: value.daily_budget } : {}),
    });
    if (fault === 'error_after') throw new MetaApiError(0, null, null, 'NetworkError', 'socket hang up', null);
  }

  async setStatus(_t: string, id: string, status: 'ACTIVE' | 'PAUSED') {
    if (!this.find(id)) throw new MetaApiError(400, 100, 33, 'GraphMethodException', 'Object does not exist', null);
    this.calls.push({ op: 'setStatus', id, value: status });
    this.apply(id, { status });
  }

  async setDailyBudget(_t: string, adsetId: string, amount: string) {
    if (this.find(adsetId)?.type !== 'adset') {
      throw new MetaApiError(400, 100, 33, 'GraphMethodException', 'Object does not exist', null);
    }
    this.calls.push({ op: 'setDailyBudget', id: adsetId, value: amount });
    this.apply(adsetId, { daily_budget: amount });
  }

  async copyAdSet(_t: string, adsetId: string) {
    const src = this.find(adsetId);
    if (src?.type !== 'adset')
      throw new MetaApiError(400, 100, 33, 'GraphMethodException', 'Object does not exist', null);
    this.calls.push({ op: 'copyAdSet', id: adsetId });
    const fault = this.fault;
    this.fault = null;
    if (fault === 'error_before')
      throw new MetaApiError(500, 2, null, 'OAuthException', 'Service temporarily unavailable', null);
    const copiedAdSetId = `${adsetId}9${mockWriteState.copies.size + 1}`;
    mockWriteState.copies.set(copiedAdSetId, {
      id: copiedAdSetId,
      name: `${src.obj.name ?? ''} - Copy`,
      campaign_id: src.obj.campaign_id ?? '',
      status: fault === 'wrong_value' ? 'ACTIVE' : 'PAUSED',
      effective_status: fault === 'wrong_value' ? 'ACTIVE' : 'PAUSED',
      daily_budget: src.obj.daily_budget ?? null,
      lifetime_budget: src.obj.lifetime_budget ?? null,
    });
    if (fault === 'error_after') throw new MetaApiError(0, null, null, 'NetworkError', 'socket hang up', null);
    return { copiedAdSetId };
  }
}
