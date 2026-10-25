import { redirect } from 'next/navigation';

/** X05 Trung tâm thông báo đã gộp vào màn Thông báo (PM 25/10) — giữ đường dẫn cũ (link trong email). */
export default function NotificationsPage() {
  redirect('/w/alerts');
}
