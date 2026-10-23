import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { emailPreviews } from '@adxlens/core/notification';
import { Card, CardHeader, PageHeader } from '@adxlens/ui';
import { requireStaff } from '@/server/admin-context';

export async function generateMetadata() {
  const t = await getTranslations('admin.emails');
  return { title: t('title') };
}

/**
 * Xem trước mẫu email (E01–E07 + email thông báo) bằng dữ liệu mẫu cố định. HTML hiện trong iframe `sandbox` rỗng
 * (không chạy script, không cùng origin). Không gửi email.
 */
export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; locale?: string }>;
}) {
  await requireStaff();
  const t = await getTranslations('admin.emails');
  const sp = await searchParams;
  const locale = sp.locale === 'en' ? 'en' : 'vi';
  const all = emailPreviews(locale);
  const current = all.find((p) => p.key === sp.key) ?? all[0]!;
  const href = (key: string, l = locale) => `/admin/emails?key=${encodeURIComponent(key)}&locale=${l}`;
  const label = (key: string) => (t.has(`keys.${key}`) ? t(`keys.${key}`) : key);
  return (
    <>
      <PageHeader title={t('title')} />
      <p className="mb-3 text-body text-fg-secondary">{t('body')}</p>
      <div className="flex gap-4">
        <Card className="w-72 shrink-0">
          <div className="flex gap-2 px-4 py-3 text-body">
            {(['vi', 'en'] as const).map((l) => (
              <Link
                key={l}
                href={href(current.key, l)}
                className={l === locale ? 'font-medium text-fg' : 'text-fg-secondary hover:text-fg'}
              >
                {l.toUpperCase()}
              </Link>
            ))}
          </div>
          <ul className="max-h-[70vh] overflow-y-auto border-t border-line">
            {all.map((p) => (
              <li key={p.key}>
                <Link
                  href={href(p.key)}
                  className={`block px-4 py-2 text-body ${p.key === current.key ? 'bg-subtle font-medium' : 'hover:bg-hover'}`}
                >
                  {label(p.key)}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="min-w-0 flex-1">
          <CardHeader title={current.message.subject} />
          <iframe
            title={current.message.subject}
            sandbox=""
            srcDoc={current.message.html}
            className="h-[70vh] w-full border-0 bg-white"
            data-testid="email-preview"
          />
        </Card>
      </div>
    </>
  );
}
