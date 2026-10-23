import type { Candidate, EntitySnapshot, Rule } from '../types';
import { isActive, spendOf, windowEvidence } from './helpers';

/** Tên mặc định Meta/người dùng hay để lại (không phân biệt hoa thường, bỏ số thứ tự cuối). */
const DEFAULT_NAMES = [
  'new campaign',
  'new ad set',
  'new ad',
  'new sales campaign',
  'new leads campaign',
  'new traffic campaign',
  'chiến dịch mới',
  'nhóm quảng cáo mới',
  'quảng cáo mới',
  'untitled',
];
/** Hậu tố bản sao: "… - Copy", "… – Bản sao 2". */
const COPY_SUFFIX = /\s*[-–—]?\s*(copy|bản sao)(\s*\d+)?\s*$/i;

function isDefaultName(name: string | null): boolean {
  if (!name?.trim()) return true;
  if (COPY_SUFFIX.test(name)) return true;
  return DEFAULT_NAMES.includes(
    name
      .toLowerCase()
      .replace(/\s*\d+\s*$/, '')
      .trim(),
  );
}

/**
 * Vệ sinh tài khoản (PRD 9.4, không cần insights cho phần tên): campaign/ad set đang bật mà 7 ngày không
 * chi tiêu, và đối tượng đang chạy để tên mặc định / bản sao. Mức độ thấp.
 */
export const accountHygiene: Rule<{ checkNames: number; checkIdle: number }> = {
  id: 'account_hygiene',
  group: 'hygiene',
  phase: 'P0',
  defaults: { checkNames: 1, checkIdle: 1 },
  minData: 'Cấu trúc tài khoản đã đồng bộ; kiểm tra "bật mà không chi tiêu" cần ≥ 7 ngày dữ liệu.',
  detect(s, c) {
    const out: Candidate[] = [];
    const levels: ['campaign' | 'adset' | 'ad', EntitySnapshot[]][] = [
      ['campaign', s.campaigns],
      ['adset', s.adsets],
      ['ad', s.ads],
    ];
    for (const [type, list] of levels) {
      for (const e of list) {
        if (!isActive(e)) continue;
        if (c.checkNames && isDefaultName(e.name)) {
          out.push({
            entityType: type,
            metaId: e.metaId,
            entityName: e.name,
            severity: 'low',
            impactEstimate: null,
            impactMethod: null,
            evidence: { issue: 'default_name', name: e.name },
            why: { key: 'rules.account_hygiene.whyName', params: { name: e.name ?? '' } },
            whatToDo: { key: 'rules.account_hygiene.whatName' },
          });
        } else if (c.checkIdle && type !== 'ad' && s.daysWithData >= 7 && spendOf(e.cur) === 0) {
          out.push({
            entityType: type,
            metaId: e.metaId,
            entityName: e.name,
            severity: 'low',
            impactEstimate: null,
            impactMethod: null,
            evidence: { issue: 'active_no_delivery', window: windowEvidence(s) },
            why: { key: 'rules.account_hygiene.whyIdle' },
            whatToDo: { key: 'rules.account_hygiene.whatIdle' },
          });
        }
      }
    }
    return out;
  },
};

export { isDefaultName };
