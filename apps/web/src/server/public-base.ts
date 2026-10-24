import 'server-only';
import { headers } from 'next/headers';
import { publicOrigin, publicReportBase, type RequestLike } from '@/lib/public-url';

/**
 * Gốc URL công khai cho mọi link tuyệt đối do web tạo (redirect_uri Meta OAuth, link trong email, URL trả về sau thanh
 * toán, data deletion): `APP_URL` (script dev công khai đặt bằng `PUBLIC_DEV_APP_URL`) → header proxy → origin request.
 * Không dùng `getEnv().APP_URL` ở đây: biến đó tự điền `http://localhost:3000` khi thiếu, sau tunnel sẽ sai.
 */
export function appBaseUrl(req: RequestLike): string {
  return publicOrigin(req);
}

/** Gốc link báo cáo công khai `/r/<token>`. */
export function reportBaseUrl(req: RequestLike): string {
  return publicReportBase(req);
}

/** "Request" từ header hiện tại, cho Server Component / Server Action (không có đối tượng Request). */
export async function currentRequest(): Promise<RequestLike> {
  const h = await headers();
  return { url: `http://${h.get('host') ?? 'localhost:3000'}/`, headers: h };
}
