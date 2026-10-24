// Địa chỉ công khai của app cho redirect tuyệt đối (không phụ thuộc Next.js để dùng được cả ở middleware và test).

type RequestLike = { url: string; headers: { get(name: string): string | null } };

const first = (v: string | null) => v?.split(',')[0]?.trim() || null;

/**
 * Origin mà trình duyệt đang dùng. Sau proxy (Cloudflare Tunnel, docs/runbooks/dev-public.md) `request.url` là địa chỉ
 * nội bộ (`http://localhost:3000`), nên KHÔNG dùng nó để chuyển hướng. Thứ tự:
 * 1. `APP_URL` (cấu hình tin cậy; script dev công khai đặt bằng `PUBLIC_DEV_APP_URL`);
 * 2. `x-forwarded-host` + `x-forwarded-proto` của proxy;
 * 3. `request.url` (chạy localhost không qua proxy).
 */
export function publicOrigin(req: RequestLike, appUrl: string | undefined = process.env.APP_URL): string {
  if (appUrl) {
    try {
      return new URL(appUrl).origin;
    } catch {
      // APP_URL sai định dạng → dùng các nguồn sau.
    }
  }
  const host = first(req.headers.get('x-forwarded-host'));
  if (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) {
    const proto = first(req.headers.get('x-forwarded-proto')) === 'http' ? 'http' : 'https';
    return `${proto}://${host}`;
  }
  return new URL(req.url).origin;
}

/** URL tuyệt đối cho `path` nội bộ (vd. `/login?next=...`) theo origin công khai. */
export function publicUrl(path: string, req: RequestLike, appUrl: string | undefined = process.env.APP_URL): URL {
  return new URL(path, publicOrigin(req, appUrl));
}
