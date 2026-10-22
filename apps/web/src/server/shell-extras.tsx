import 'server-only';
import type { ReactNode } from 'react';
import type { PageContext } from './page-context';

/**
 * Phần phụ của khung app: số thông báo chưa đọc (X05) và banner hệ thống (X04: token hết hạn,
 * past_due, vượt hạn mức, kill switch, dữ liệu mẫu). Các feature sau đăng ký nguồn banner tại đây.
 */
export type BannerSource = (pc: PageContext) => Promise<ReactNode | null>;

const bannerSources: BannerSource[] = [];
let unreadSource: ((pc: PageContext) => Promise<number>) | null = null;

export function registerBannerSource(s: BannerSource): void {
  bannerSources.push(s);
}

export function registerUnreadSource(s: (pc: PageContext) => Promise<number>): void {
  unreadSource = s;
}

export async function getShellExtras(pc: PageContext): Promise<{ unread: number; banner: ReactNode }> {
  // Mỗi lần chỉ một banner (design-system: Banner), ưu tiên theo thứ tự đăng ký.
  let banner: ReactNode = null;
  for (const s of bannerSources) {
    banner = await s(pc);
    if (banner) break;
  }
  const unread = unreadSource ? await unreadSource(pc) : 0;
  return { unread, banner: banner ? <div className="px-6 pt-4">{banner}</div> : null };
}
