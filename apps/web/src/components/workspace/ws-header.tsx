'use client';

import { FileDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition, type ReactNode } from 'react';
import { Button, Select } from '@adxlens/ui';
import { api } from '@/lib/api-client';
import { PeriodFilter } from './period-filter';

/**
 * Đầu trang Workspace: tiêu đề · bộ lọc tài khoản QC · kỳ 7/14/30 ngày. `period` chỉ truyền ở trang mà mọi khối đều theo
 * kỳ; trang không có dữ liệu theo kỳ (hoặc chỉ một khối) không truyền — khối đó tự đặt `PeriodFilter`.
 */
export function WsHeader({
  title,
  subtitle,
  accounts,
  selectedId,
  period,
  printPeriod,
  actions,
  hideScope,
}: {
  title: string;
  subtitle?: ReactNode;
  accounts: { id: string; name: string }[];
  selectedId: string | null;
  period?: string;
  /** Kỳ hiện ở dòng in (khi bộ lọc kỳ nằm trong một khối của trang). */
  printPeriod?: string;
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
          {scopeName ?? t('scope.agency', { n: accounts.length })}
          {(period ?? printPeriod) ? ` · ${t(`periods.${period ?? printPeriod}` as never)}` : ''}
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
        {period ? <PeriodFilter period={period} /> : null}
      </div>
    </header>
  );
}
