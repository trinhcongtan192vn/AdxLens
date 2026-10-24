/**
 * Link Storage cho trình duyệt (docs/runbooks/dev-public.md): server gọi Supabase qua địa chỉ nội bộ (`SUPABASE_URL`,
 * vd. 127.0.0.1), nhưng link logo / PDF gửi cho người xem phải dùng địa chỉ công khai (`STORAGE_PUBLIC_URL`, vd.
 * hostname Supabase của Cloudflare Tunnel). Không có `STORAGE_PUBLIC_URL` hoặc link không thuộc `SUPABASE_URL` → giữ nguyên.
 */
export function publicStorageUrl(
  url: string,
  internalBase: string | undefined,
  publicBase: string | undefined,
): string {
  if (!internalBase || !publicBase) return url;
  const from = internalBase.replace(/\/+$/, '');
  const to = publicBase.replace(/\/+$/, '');
  return url === from || url.startsWith(`${from}/`) ? `${to}${url.slice(from.length)}` : url;
}
