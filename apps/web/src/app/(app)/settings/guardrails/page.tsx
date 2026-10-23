import { effectiveGuardrails, executionControls, GUARDRAIL_DEFAULTS } from '@adxlens/core/execution';
import { requirePermission } from '@/server/guards';
import { getPageContext, requireFlag } from '@/server/page-context';
import { GuardrailsForm } from './guardrails-form';
import { KillSwitchCard } from './kill-switch-card';

/** P205 Guardrails của workspace (Owner): mặc định cố định, chỉ siết chặt hơn. Sau cờ duyệt hành động. */
export default async function GuardrailsPage() {
  const pc = await getPageContext();
  await requireFlag(pc, 'p2a_approve');
  requirePermission(pc, 'guardrails.manage');
  const [g, controls] = await Promise.all([effectiveGuardrails(pc.ctx), executionControls(pc.ctx)]);
  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <KillSwitchCard controls={controls} />
      <GuardrailsForm initial={g} defaults={{ ...GUARDRAIL_DEFAULTS, excludeMetaIds: [] }} />
    </div>
  );
}
