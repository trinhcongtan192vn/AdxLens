import { redirect } from 'next/navigation';

/** Tổng quan cũ (O01) đã gộp vào trang chủ `/w` (khối "Khách cần chú ý"); giữ URL để link cũ vẫn chạy. */
export default function OverviewPage() {
  redirect('/w');
}
