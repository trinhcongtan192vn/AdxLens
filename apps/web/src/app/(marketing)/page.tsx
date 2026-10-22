import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@adxlens/ui';

/** M01 Landing (Penpot). Định vị theo PRD 13.1. */
export default async function Landing() {
  const t = await getTranslations('marketing');
  const features = ['match', 'brand', 'evidence'] as const;
  const steps = ['connect', 'assign', 'send'] as const;
  return (
    <div className="mx-auto max-w-[1112px] px-6 py-14">
      <section className="mx-auto max-w-[820px]">
        <h1 className="text-[40px] font-semibold leading-[48px] text-fg">{t('landing.title')}</h1>
        <p className="mt-3 text-[18px] leading-[24px] text-fg-secondary">{t('landing.subtitle')}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/signup" className={buttonVariants({ kind: 'primary', size: 'm' })}>
            {t('cta.tryFree')}
          </Link>
          <Link href="/r/demo" className={buttonVariants({ kind: 'secondary', size: 'm' })}>
            {t('landing.sampleReport')}
          </Link>
        </div>
        <p className="mt-4 text-small text-fg-tertiary">{t('landing.assurance')}</p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {features.map((f) => (
          <div key={f} className="rounded-lg border border-line bg-canvas px-4 py-4">
            <h2 className="text-h3 font-semibold text-fg">{t(`landing.features.${f}.title`)}</h2>
            <p className="mt-1 text-body text-fg-secondary">{t(`landing.features.${f}.body`)}</p>
          </div>
        ))}
      </section>

      <section id="how-it-works" className="mt-8">
        <h2 className="text-center text-h2 font-semibold text-fg">{t('landing.howItWorks')}</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-3 rounded-lg border border-line px-4 py-3">
              <span className="num flex size-5 items-center justify-center rounded-xs border border-info-line bg-info-bg text-caption text-info">
                {i + 1}
              </span>
              <span className="text-body font-medium text-fg">{t(`landing.steps.${s}`)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
