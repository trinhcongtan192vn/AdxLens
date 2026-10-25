/**
 * Meta GHI giả (META_MOCK=1, local/test): ghi vào `mockWriteState` để `MockMetaRead` đọc lại được. Có
 * cài lỗi theo kịch bản cho test gateway: lỗi trước khi áp, lỗi sau khi đã áp (Meta đã đổi nhưng trả lỗi),
 * và áp sai giá trị (verify không khớp). Chỉ `packages/core/execution` import (ranh giới `write`).
 */
import { MetaApiError } from './errors';
import { MOCK_ACCOUNTS, mockStructure, mockWriteState } from './mock';
import {
  adSetTargeting,
  type NewAdSetTargeting,
  customAudienceRule,
  type CustomAudienceSource,
  type MetaObjectType,
  type MetaWriteApi,
  type WritableObject,
} from './write';

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
            bid_amount: adset.bid_amount ?? null,
            campaign_id: adset.campaign_id,
            account_id: a.id.replace(/^act_/, ''),
          },
        };
      }
      const camp = s.campaigns.find((x) => x.id === id);
      if (camp) {
        return {
          type: 'campaign',
          obj: {
            id: camp.id,
            name: camp.name,
            status: camp.status,
            effective_status: camp.effective_status,
            spend_cap: camp.spend_cap ?? null,
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

  private apply(
    id: string,
    patch: { status?: string; daily_budget?: string; name?: string; bid_amount?: string; spend_cap?: string },
  ) {
    const fault = this.fault;
    this.fault = null;
    if (fault === 'error_before')
      throw new MetaApiError(500, 2, null, 'OAuthException', 'Service temporarily unavailable', null);
    const wrong = fault === 'wrong_value';
    const value = wrong
      ? {
          status: patch.status ? 'ARCHIVED' : undefined,
          daily_budget: patch.daily_budget ? '1' : undefined,
          name: patch.name ? `${patch.name} (sai)` : undefined,
          bid_amount: patch.bid_amount ? '1' : undefined,
          spend_cap: patch.spend_cap ? '1' : undefined,
        }
      : patch;
    const cur = mockWriteState.overrides.get(id) ?? {};
    mockWriteState.overrides.set(id, {
      ...cur,
      ...(value.status ? { status: value.status } : {}),
      ...(value.daily_budget ? { daily_budget: value.daily_budget } : {}),
      ...(value.name ? { name: value.name } : {}),
      ...(value.bid_amount ? { bid_amount: value.bid_amount } : {}),
      ...(value.spend_cap ? { spend_cap: value.spend_cap } : {}),
    });
    if (fault === 'error_after') throw new MetaApiError(0, null, null, 'NetworkError', 'socket hang up', null);
  }

  async setStatus(_t: string, id: string, status: 'ACTIVE' | 'PAUSED') {
    if (!this.find(id)) throw new MetaApiError(400, 100, 33, 'GraphMethodException', 'Object does not exist', null);
    this.calls.push({ op: 'setStatus', id, value: status });
    this.apply(id, { status });
  }

  async setName(_t: string, id: string, name: string) {
    if (!this.find(id)) throw new MetaApiError(400, 100, 33, 'GraphMethodException', 'Object does not exist', null);
    this.calls.push({ op: 'setName', id, value: name });
    this.apply(id, { name });
  }

  async setBidAmount(_t: string, adsetId: string, amount: string) {
    if (this.find(adsetId)?.type !== 'adset') {
      throw new MetaApiError(400, 100, 33, 'GraphMethodException', 'Object does not exist', null);
    }
    this.calls.push({ op: 'setBidAmount', id: adsetId, value: amount });
    this.apply(adsetId, { bid_amount: amount });
  }

  async setSpendCap(_t: string, campaignId: string, amount: string) {
    if (this.find(campaignId)?.type !== 'campaign') {
      throw new MetaApiError(400, 100, 33, 'GraphMethodException', 'Object does not exist', null);
    }
    this.calls.push({ op: 'setSpendCap', id: campaignId, value: amount });
    this.apply(campaignId, { spend_cap: amount });
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

  private takeFault() {
    const fault = this.fault;
    this.fault = null;
    if (fault === 'error_before')
      throw new MetaApiError(500, 2, null, 'OAuthException', 'Service temporarily unavailable', null);
    return fault;
  }

  async createAd(_t: string, act: string, input: { name: string; adsetId: string; creativeId: string }) {
    const s = mockStructure(act);
    const adset = s.adsets.find((x) => x.id === input.adsetId);
    if (!adset || !s.creatives.some((c) => c.id === input.creativeId)) {
      throw new MetaApiError(400, 100, null, 'OAuthException', 'Invalid parameter', null);
    }
    this.calls.push({ op: 'createAd', id: input.adsetId, value: input.creativeId });
    const fault = this.takeFault();
    const id = `${input.adsetId}8${mockWriteState.createdAds.size + 1}`;
    const status = fault === 'wrong_value' ? 'ACTIVE' : 'PAUSED';
    mockWriteState.createdAds.set(id, {
      id,
      name: input.name,
      adset_id: input.adsetId,
      campaign_id: adset.campaign_id,
      status,
      effective_status: status,
      creative: { id: input.creativeId },
      act,
    });
    if (fault === 'error_after') throw new MetaApiError(0, null, null, 'NetworkError', 'socket hang up', null);
    return { id };
  }

  async createLookalike(
    _t: string,
    act: string,
    input: { name: string; originAudienceId: string; country: string; ratio: string },
  ) {
    this.calls.push({ op: 'createLookalike', id: input.originAudienceId, value: `${input.country}:${input.ratio}` });
    const fault = this.takeFault();
    const id = `ca_new_${mockWriteState.createdAudiences.size + 1}`;
    mockWriteState.createdAudiences.set(id, {
      id,
      name: input.name,
      subtype: fault === 'wrong_value' ? 'CUSTOM' : 'LOOKALIKE',
      act,
    });
    if (fault === 'error_after') throw new MetaApiError(0, null, null, 'NetworkError', 'socket hang up', null);
    return { id };
  }

  async createCustomAudience(_t: string, act: string, input: { name: string; source: CustomAudienceSource }) {
    customAudienceRule(input.source); // cùng kiểm tra như bản thật
    this.calls.push({
      op: 'createCustomAudience',
      id: input.source.id,
      value: `${input.source.type}:${input.source.days}`,
    });
    const fault = this.takeFault();
    const id = `ca_new_${mockWriteState.createdAudiences.size + 1}`;
    const subtype = input.source.type === 'pixel' ? 'WEBSITE' : 'ENGAGEMENT';
    mockWriteState.createdAudiences.set(id, {
      id,
      name: input.name,
      subtype: fault === 'wrong_value' ? 'CUSTOM' : subtype,
      act,
    });
    if (fault === 'error_after') throw new MetaApiError(0, null, null, 'NetworkError', 'socket hang up', null);
    return { id };
  }

  async createAdSet(
    _t: string,
    _act: string,
    input: { name: string; templateAdSetId: string; dailyBudget: string | null; targeting: NewAdSetTargeting },
  ) {
    adSetTargeting(input.targeting); // cùng kiểm tra như bản thật
    const tpl = this.find(input.templateAdSetId);
    if (tpl?.type !== 'adset')
      throw new MetaApiError(400, 100, 33, 'GraphMethodException', 'Object does not exist', null);
    this.calls.push({
      op: 'createAdSet',
      id: input.templateAdSetId,
      value: `${input.name}:${input.dailyBudget ?? '-'}`,
    });
    const fault = this.takeFault();
    const id = `${input.templateAdSetId}8${mockWriteState.copies.size + 1}`;
    mockWriteState.copies.set(id, {
      id,
      name: input.name,
      campaign_id: tpl.obj.campaign_id ?? '',
      status: fault === 'wrong_value' ? 'ACTIVE' : 'PAUSED',
      effective_status: fault === 'wrong_value' ? 'ACTIVE' : 'PAUSED',
      daily_budget: input.dailyBudget,
      lifetime_budget: null,
    });
    if (fault === 'error_after') throw new MetaApiError(0, null, null, 'NetworkError', 'socket hang up', null);
    return { id };
  }

  async getAudience(_t: string, id: string) {
    const a = mockWriteState.createdAudiences.get(id);
    if (!a) throw new MetaApiError(400, 100, 33, 'GraphMethodException', 'Object does not exist', null);
    return { id: a.id, name: a.name, subtype: a.subtype };
  }
}
