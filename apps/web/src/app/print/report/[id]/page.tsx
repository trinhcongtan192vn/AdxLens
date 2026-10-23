import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { schema } from '@adxlens/db';
import { getReport, type ReportContent } from '@adxlens/core/reporting';
import { SYSTEM_ACTOR } from '@adxlens/core/shared';
import { ReportView } from '@/report/report-view';
import { deps } from '@/server/deps';
import { verify } from '@/server/signed';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return { title: 'AdxLens PDF', robots: { index: false, follow: false } };
}

/**
 * Trang in nội bộ cho PDF (L3 9, R07): chỉ mở được bằng URL ký 10 phút do worker tạo (`?key=`), đúng báo
 * cáo và workspace. A4, cùng mẫu với trang công khai.
 */
export default async function PrintReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { id } = await params;
  const claim = verify<{ r: string; w: string }>((await searchParams).key);
  if (!claim || claim.r !== id) notFound();
  const { db, storage } = deps();
  const report = await getReport({ db, workspaceId: claim.w, actor: SYSTEM_ACTOR }, id).catch(() => null);
  if (!report || report.status !== 'ready') notFound();
  const [ws] = await db
    .select({ badgeRemoved: schema.workspaces.badgeRemoved })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, claim.w));
  const content = report.content as ReportContent;
  return (
    <main className="print-a4 bg-surface">
      <style>{`@page { size: A4; margin: 14mm 12mm; } html, body { background: #fff; } .break-inside-avoid { break-inside: avoid; }`}</style>
      <ReportView
        content={content}
        edits={report.edits}
        summary={report.summaryText}
        logoUrl={content.brand.logoPath ? storage.publicUrl('brand', content.brand.logoPath) : null}
        showBadge={!ws?.badgeRemoved}
      />
    </main>
  );
}
