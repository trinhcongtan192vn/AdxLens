import { cookies } from 'next/headers';
import { toLocale, LOCALE_COOKIE } from '@/i18n/locale';
import { demoReportContent } from '@/report/demo-report';
import { ReportView } from '@/report/report-view';

export async function generateMetadata() {
  return { title: 'AdxLens', robots: { index: false, follow: false } };
}

/** Báo cáo mẫu công khai (trang chủ "Xem báo cáo mẫu"): số liệu minh họa, ghi rõ là mẫu. */
export default async function DemoReportPage() {
  const locale = toLocale((await cookies()).get(LOCALE_COOKIE)?.value) as 'vi' | 'en';
  return (
    <main className="min-h-screen bg-canvas px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-[860px] rounded-lg border border-line bg-surface px-4 py-6 sm:px-8">
        <ReportView content={demoReportContent(locale)} edits={{}} summary={null} logoUrl={null} showBadge />
      </div>
    </main>
  );
}
