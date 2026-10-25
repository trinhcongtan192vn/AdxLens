/**
 * Right panel (PM 25/10): trợ lý theo ngữ cảnh màn đang xem — Hỏi AI · Giải thích · Thông báo. Mặc định gập, mở khi
 * cần, nhớ trạng thái theo người dùng (cookie). Hàm thuần để test được.
 */
export const RP_COOKIE = 'rp';
export const RP_TABS = ['ask', 'explain', 'inbox'] as const;
export type RpTab = (typeof RP_TABS)[number];

/** Sự kiện trang gửi cho panel: mở panel và hỏi ngay (vd. nút ✨ cạnh KPI). */
export const RP_ASK_EVENT = 'adx:panel-ask';
export type RpAskDetail = { question: string };

export type PanelEntity = { level: 'campaign' | 'adset' | 'ad'; metaId: string };

/** Ngữ cảnh gửi kèm câu hỏi: trang chi tiết đối tượng → đối tượng đó (agent bắt đầu bằng entity_details). */
export function panelEntities(pathname: string): PanelEntity[] {
  const m = /^\/accounts\/[^/]+\/(campaign|adset|ad)\/(\d{1,30})$/.exec(pathname);
  return m ? [{ level: m[1] as PanelEntity['level'], metaId: m[2]! }] : [];
}

/** Panel ẩn ở trang AI Agents (đã là màn hỏi đáp đầy đủ). */
export function panelHidden(pathname: string): boolean {
  return pathname === '/w/agents' || pathname.startsWith('/w/agents/');
}

/** Gợi ý "Giải thích" theo màn: khóa i18n `panel.explain.q.*`. */
export function explainPresets(pathname: string): string[] {
  if (panelEntities(pathname).length) return ['entity', 'children'];
  if (pathname.startsWith('/w/ads') || pathname.startsWith('/w/scale')) return ['fatigue', 'best', 'cpa'];
  if (pathname.startsWith('/w/funnels')) return ['funnel', 'cpa'];
  if (pathname.startsWith('/w/business')) return ['mer', 'spend'];
  if (pathname.startsWith('/w/geography')) return ['geo', 'cpa'];
  return ['cpa', 'spend', 'findings'];
}

export function cookieOpen(v: string | undefined): boolean {
  return v === '1';
}
