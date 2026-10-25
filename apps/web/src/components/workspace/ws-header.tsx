'use client';

import { FileDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition, type ReactNode } from 'react';
import { Button, Segmented, Select } from '@adxlens/ui';
import { api } from '@/lib/api-client';
import { W_PERIODS } from '@/lib/workspace-nav';

/** Đầu trang Workspace: tiêu đề · bộ chọn phạm vi (Agency / tài khoản) · kỳ 7/14/30 ngày. */
export function WsHeader({
  title,
  subtitle,
  accounts,
  selectedId,
  period,
  actions,
  hideScope,
}: {
  title: string;
  subtitle?: ReactNode;
  accounts: { id: string; name: string }[];
  selectedId: string | null;
  period: string;
  actions?: ReactNode;
  hideScope?: boolean;
}) {
  const scopeName = selectedId ? (accounts.find((a) => a.id === selectedId)?.name ?? '') : null;
  const t = useTranslations('ws');
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (body: Record<string, string>) =>
    start(async () => {
      await api('me/preferences', { method: 'POST', body });
      router.refresh();
    });
  return (
    <header className="mb-4 flex flex-wrap items-center gap-3" aria-busy={pending}>
      <div className="min-w-0 flex-1">
        <h1 className="text-h2 font-semibold text-fg">{title}</h1>
        {subtitle ? <p className="text-small text-fg-tertiary">{subtitle}</p> : null}
        {/* Chỉ khi in / xuất PDF: ghi phạm vi + kỳ thay cho bộ chọn (bị ẩn khi in). */}
        <p className="hidden text-small text-fg-secondary print:block">
          {scopeName ?? t('scope.agency', { n: accounts.length })} · {t(`periods.${period}` as never)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        {actions}
        {/* Madgicx 360° Audit "Export PDF": in trang hiện tại (trình duyệt → Lưu thành PDF). */}
        <Button kind="secondary" size="s" onClick={() => window.print()} data-testid="ws-export-pdf">
          <FileDown className="size-4" aria-hidden />
          {t('exportPdf')}
        </Button>
        {/* Bộ lọc tài khoản QC trong Client đang chọn (Client chọn ở sidebar); 1 tài khoản thì không cần. */}
        {hideScope || (accounts.length <= 1 && !selectedId) ? null : (
          <Select
            className="w-64"
            value={selectedId ?? 'all'}
            onChange={(e) => set({ wScope: e.target.value })}
            aria-label={t('scope.label')}
            data-testid="ws-scope"
          >
            <option value="all">{t('scope.agency', { n: accounts.length })}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        )}
        <div role="group" aria-label={t('periodLabel')}>
          <Segmented
            value={(W_PERIODS as readonly string[]).includes(period) ? period : 'last7'}
            onChange={(v: string) => set({ period: v })}
            options={W_PERIODS.map((p) => ({ value: p, label: t(`periods.${p}`) }))}
          />
        </div>
      </div>
    </header>
  );
}
