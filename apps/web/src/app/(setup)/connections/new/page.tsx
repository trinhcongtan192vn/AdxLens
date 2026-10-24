import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { READ_SCOPES } from '@adxlens/meta-client';
import { Badge, buttonVariants } from '@adxlens/ui';
import { SetupShell } from '@/components/setup-shell';
import { requirePermission } from '@/server/guards';
import { getPageContext } from '@/server/page-context';

export async function generateMetadata() {
  const t = await getTranslations('connect');
  return { title: t('s03Title') };
}

/** S03 Giải thích quyền chỉ đọc trước OAuth (Penpot). */
export default async function ExplainPermissionsPage() {
  const pc = await getPageContext();
  requirePermission(pc, 'connections.manage');
  const t = await getTranslations('connect');
  const rows = [
    { tone: 'success', yes: true, k: 'read' },
    { tone: 'danger', yes: false, k: 'write' },
    { tone: 'success', yes: true, k: 'control' },
  ] as const;
  return (
    <SetupShell stepLabel={t('step', { n: 2, total: 4 })}>
      <h1 className="text-h2 font-semibold text-fg">{t('s03Title')}</h1>
      <p className="mt-3 text-body text-fg-secondary">{t('s03Intro')}</p>
      <div className="mt-4 flex flex-col gap-4">
        {rows.map((r) => (
          <div
            key={r.k}
            className={`flex items-start gap-3 rounded-lg px-3 py-3 ${r.tone === 'success' ? 'bg-success-bg' : 'bg-danger-bg'}`}
          >
            <Badge tone={r.tone}>{r.yes ? t('yes') : t('no')}</Badge>
            <div>
              <p className="text-body font-medium text-fg">{t(`s03.${r.k}.title`)}</p>
              <p className="text-small text-fg-secondary">{t(`s03.${r.k}.body`)}</p>
            </div>
          </div>
        ))}
      </div>
      {/* Liên kết thường (không phải fetch) để trình duyệt theo chuyển hướng 302 tới Meta. */}
      <a
        href="/api/v1/connections/meta/authorize?scope=read"
        className={buttonVariants({ kind: 'primary', size: 'm', className: 'mt-4 w-full' })}
      >
        {t('continueWithMeta')}
      </a>
      <Link href="/demo" className="mt-4 block text-body text-link hover:underline">
        {t('viewDemo')}
      </Link>
      <p className="mt-4 text-small text-fg-tertiary">{t('scopes', { scopes: READ_SCOPES.join(', ') })}</p>
    </SetupShell>
  );
}
