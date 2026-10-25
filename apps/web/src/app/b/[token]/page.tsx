import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { findBusinessLinkByToken } from '@adxlens/core/ops';
import { publicBusiness, recordBusinessView } from '@adxlens/core/reporting';
import { getWorkspace } from '@adxlens/core/tenancy';
import { EmptyState } from '@adxlens/ui';
import { BusinessTiles, type BusinessTileKey } from '@/components/business-tiles';
import { deps } from '@/server/deps';
import { shareUnlockCookie } from '@/server/share-cookie';
import { verify } from '@/server/signed';
import { BusinessPasswordForm } from './password-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  // Số liệu quảng cáo của khách: không index.
  return { title: 'AdxLens', robots: { index: false, follow: false } };
}

/** ADR-0028: Business Dashboard công khai của một Client (mobile-first). Khóa khi số liệu chưa toàn vẹn. */
export default async function PublicBusinessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { db, storage } = deps();
  const link = await findBusinessLinkByToken(db, token);
  if (!link) notFound();
  const t = await getTranslations('publicBusiness');
  const tr = await getTranslations('publicReport');
  const tb = await getTranslations('wsBusiness');
  const tm = await getTranslations('metrics');
  const locale = await getLocale();
  const ctx = { db, workspaceId: link.workspaceId };
  const unlockedFor = verify<{ link: string }>((await cookies()).get(shareUnlockCookie(link.id))?.value);
  const s = await publicBusiness(ctx, link, { unlocked: unlockedFor?.link === link.id });
  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-canvas px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-[1100px]">{children}</div>
    </main>
  );
  if (s.state === 'not_found') notFound();
  if (s.state === 'revoked' || s.state === 'expired') {
    return shell(<EmptyState title={tr('expiredTitle')} description={tr('expiredBody')} />);
  }
  if (s.state === 'locked') return shell(<EmptyState title={t('lockedTitle')} description={t('lockedBody')} />);
  if (s.state === 'password') return shell(<BusinessPasswordForm token={token} />);
  if (s.state !== 'ok') notFound();
  await recordBusinessView(ctx, s.linkId);
  const ws = await getWorkspace(ctx);
  const logo = ws.brand.logo_path ? storage.publicUrl('brand', ws.brand.logo_path) : null;
  const label = (k: BusinessTileKey) => (k === 'aov' ? tb('aov') : tm(`${k}.name`));
  return shell(
    <div className="flex flex-col gap-4" data-testid="public-business">
      <header className="flex items-center gap-3">
        {logo ? <img src={logo} alt={ws.name} className="h-8 w-auto" /> : null}
        <div>
          <h1 className="text-h2 font-semibold text-fg">{s.clientName}</h1>
          <p className="text-small text-fg-tertiary">{t('period', { from: s.range.from, to: s.range.to })}</p>
        </div>
      </header>
      {s.blended ? (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-3 text-h4 font-semibold text-fg">{tb('blended')}</h2>
          <BusinessTiles
            block={s.blended}
            currency={s.currency}
            locale={locale}
            label={label}
            testid="public-blended"
          />
        </section>
      ) : null}
      {s.accounts.map((a) => (
        <section key={a.id} className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 text-small font-semibold text-fg">
            {a.name} <span className="text-caption font-normal text-fg-tertiary">{a.currency}</span>
          </p>
          <BusinessTiles block={a.block} currency={a.currency} locale={locale} label={label} />
        </section>
      ))}
      <p className="text-caption text-fg-tertiary">{t('footnote')}</p>
      {s.showBadge ? <p className="text-center text-caption text-fg-tertiary">{t('poweredBy')}</p> : null}
    </div>,
  );
}
