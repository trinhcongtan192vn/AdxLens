import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { findShareByToken } from '@adxlens/core/ops';
import { getReport, publicShareState, recordShareView, type ReportContent } from '@adxlens/core/reporting';
import { SYSTEM_ACTOR } from '@adxlens/core/shared';
import { EmptyState } from '@adxlens/ui';
import { ReportView } from '@/report/report-view';
import { deps } from '@/server/deps';
import { shareUnlockCookie } from '@/server/share-cookie';
import { verify } from '@/server/signed';
import { PasswordForm } from './password-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  // Báo cáo khách không được index (dữ liệu quảng cáo của khách).
  return { title: 'AdxLens', robots: { index: false, follow: false } };
}

/** R06 Trang báo cáo công khai (mobile-first): xem được / mật khẩu / hết hạn, thu hồi / tạm khóa. */
export default async function PublicReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { db, storage } = deps();
  const link = await findShareByToken(db, token);
  if (!link) notFound();
  const t = await getTranslations('publicReport');
  const ctx = { db, workspaceId: link.workspaceId };
  const unlockedFor = verify<{ link: string }>((await cookies()).get(shareUnlockCookie(link.id))?.value);
  const state = await publicShareState(ctx, link, { unlocked: unlockedFor?.link === link.id });

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-canvas px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-[860px]">{children}</div>
    </main>
  );
  if (state.state === 'not_found') notFound();
  if (state.state === 'revoked' || state.state === 'expired') {
    return shell(<EmptyState title={t('expiredTitle')} description={t('expiredBody')} />);
  }
  if (state.state === 'locked') {
    return shell(<EmptyState title={t('lockedTitle')} description={t('lockedBody')} />);
  }
  if (state.state === 'password') {
    return shell(<PasswordForm token={token} />);
  }
  if (state.state !== 'ok') notFound();
  const report = await getReport({ ...ctx, actor: SYSTEM_ACTOR }, state.reportId);
  const content = report.content as ReportContent;
  await recordShareView(ctx, state.linkId);
  return shell(
    <div className="rounded-lg border border-line bg-surface px-4 py-6 sm:px-8">
      <ReportView
        content={content}
        edits={report.edits}
        summary={report.summaryText}
        logoUrl={content.brand.logoPath ? storage.publicUrl('brand', content.brand.logoPath) : null}
        showBadge={state.showBadge}
      />
    </div>,
  );
}
