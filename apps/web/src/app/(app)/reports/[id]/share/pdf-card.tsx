'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonVariants, Card } from '@adxlens/ui';
import { api } from '@/lib/api-client';

type PdfState = { state: 'ready' | 'none' | 'queued'; url?: string | null };

/** R04/R07: xuất PDF A4 (worker render), chờ xong rồi cho tải (URL ký 1 giờ). */
export function PdfCard({ reportId, enabled }: { reportId: string; enabled: boolean }) {
  const t = useTranslations('share');
  const tc = useTranslations('common');
  const [url, setUrl] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const exportPdf = async () => {
    setWorking(true);
    try {
      let r = await api<PdfState>(`reports/${reportId}/pdf`, { method: 'POST' });
      for (let i = 0; r.state !== 'ready' && i < 45; i++) {
        await new Promise((res) => setTimeout(res, 2000));
        r = await api<PdfState>(`reports/${reportId}/pdf`);
      }
      if (r.state === 'ready' && r.url) setUrl(r.url);
      else toast.error(t('pdfTimeout'));
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card className="px-4 py-4">
      <h2 className="text-h3 font-semibold text-fg">{t('pdfTitle')}</h2>
      <p className="mt-1 text-small text-fg-secondary">{t('pdfBody')}</p>
      <div className="mt-3 flex gap-2">
        <Button kind="secondary" size="m" disabled={!enabled || working} onClick={exportPdf}>
          {working ? t('pdfWorking') : t('pdfExport')}
        </Button>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ kind: 'primary', size: 'm' })}
          >
            {t('pdfDownload')}
          </a>
        ) : null}
      </div>
    </Card>
  );
}
