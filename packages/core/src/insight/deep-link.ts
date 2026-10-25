const LEVEL_PATH = { campaign: 'campaigns', adset: 'adsets', ad: 'ads' } as const;

/**
 * Deep link mở đúng đối tượng trong Ads Manager (PRD P0-06, L3 10.2 ví dụ):
 * `https://adsmanager.facebook.com/adsmanager/manage/ads?act=123&selected_ad_ids=456`.
 */
export function adsManagerLink(
  metaAccountId: string,
  level: 'campaign' | 'adset' | 'ad' | null,
  metaId: string | null,
): string {
  const act = metaAccountId.replace(/^act_/, '');
  const base = 'https://adsmanager.facebook.com/adsmanager/manage';
  if (!level || !metaId) return `${base}/campaigns?act=${encodeURIComponent(act)}`;
  const params = new URLSearchParams({ act, [`selected_${level}_ids`]: metaId });
  return `${base}/${LEVEL_PATH[level]}?${params}`;
}
