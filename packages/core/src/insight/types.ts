import type { I18nText } from '@adxlens/db/schema';

export type Severity = 'low' | 'medium' | 'high';

/** Tổng chỉ số của một đối tượng trong một cửa sổ. Tiền là chuỗi thập phân (numeric), không float. */
export type Metrics = {
  spend: string;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  results: number;
  conversionValue: string;
  /** Tần suất trung bình theo ngày, có trọng số hiển thị (reach không cộng được qua ngày). */
  frequency: number;
  /** Số ngày có chi tiêu > 0. */
  activeDays: number;
};

export type EntityInfo = {
  metaId: string;
  name: string | null;
  status: string | null;
  parentMetaId: string | null;
  objective: string | null;
  dailyBudget: string | null;
  learningStage: string | null;
  attrs: Record<string, unknown>;
};

export type EntitySnapshot = EntityInfo & { cur: Metrics; prev: Metrics };

export type Window = { from: string; to: string };

/** Ảnh chụp dữ liệu một tài khoản cho engine (L3 8): cửa sổ 7 ngày gần so với 7 ngày trước. */
export type Snapshot = {
  account: { id: string; metaAccountId: string; name: string; currency: string; timezone: string };
  version: string;
  window: { cur: Window; prev: Window };
  campaigns: EntitySnapshot[];
  adsets: EntitySnapshot[];
  ads: EntitySnapshot[];
  /** Theo ngày ở cấp tài khoản, 28 ngày gần nhất (theo dõi chuyển đổi). */
  daily: { date: string; spend: string; results: number; linkClicks: number }[];
  /** Số ngày có dữ liệu trong 28 ngày. */
  daysWithData: number;
};

/** Một phát hiện do quy tắc trả về, trước khi lưu. */
export type Candidate = {
  entityType: 'account' | 'campaign' | 'adset' | 'ad';
  metaId: string;
  entityName: string | null;
  severity: Severity;
  /** Tác động ước tính theo tiền tệ tài khoản (chuỗi numeric) hoặc null khi không ước tính được. */
  impactEstimate: string | null;
  /** Khóa i18n mô tả cách tính tác động (`rules.<id>.impact`). */
  impactMethod: string | null;
  evidence: Record<string, unknown>;
  why: I18nText;
  whatToDo: I18nText;
};

/**
 * Hợp đồng một quy tắc (L2 5.1). `minData` mô tả điều kiện đủ dữ liệu; `detect` PHẢI tự kiểm và
 * không trả gì khi thiếu dữ liệu ("thà ít quy tắc chắc còn hơn nhiều quy tắc báo sai", PRD 9.4).
 */
export type Rule<C extends Record<string, number> = Record<string, number>> = {
  id: string;
  group: string;
  phase: 'P0';
  defaults: C;
  minData: string;
  // Cú pháp method (bivariant) để RULES chứa được quy tắc với kiểu cấu hình riêng.
  detect(s: Snapshot, config: C): Candidate[];
};
