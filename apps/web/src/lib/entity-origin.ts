/**
 * Trang nguồn của trang chi tiết chiến dịch / nhóm QC / QC (PM 25/10: mở chi tiết không "nhảy" sang khu vực client).
 * Chi tiết mở ở khung giữa; breadcrumb bắt đầu bằng trang nguồn, sidebar giữ mục nguồn sáng. Hàm thuần.
 */
export const ENTITY_ORIGINS = {
  'ads-manager': { href: '/w/ads-manager', nav: 'adsManager' },
  ads: { href: '/w/ads', nav: 'ads' },
  scale: { href: '/w/scale', nav: 'scale' },
  home: { href: '/w', nav: 'home' },
} as const;
export type EntityOrigin = keyof typeof ENTITY_ORIGINS;
const DEFAULT: EntityOrigin = 'ads-manager';

export function parseOrigin(v: string | null | undefined): EntityOrigin {
  return v && v in ENTITY_ORIGINS ? (v as EntityOrigin) : DEFAULT;
}

/** Thêm `from=` vào đường dẫn chi tiết (giữ tham số sẵn có). */
export function withOrigin(href: string, origin: EntityOrigin): string {
  if (origin === DEFAULT) return href;
  return `${href}${href.includes('?') ? '&' : '?'}from=${origin}`;
}

/** Trang chi tiết đối tượng: `/accounts/{id}/{campaign|adset|ad}/{metaId}`. */
export function isEntityDetail(pathname: string): boolean {
  return /^\/accounts\/[^/]+\/(campaign|adset|ad)\/[^/]+$/.test(pathname);
}

/** Mục sidebar coi là đang mở: ở trang chi tiết → trang nguồn; còn lại → chính đường dẫn. */
export function activeNavPath(pathname: string, search: string): string {
  if (!isEntityDetail(pathname)) return pathname;
  return ENTITY_ORIGINS[parseOrigin(new URLSearchParams(search).get('from'))].href;
}
