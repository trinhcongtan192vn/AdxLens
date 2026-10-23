import { effectiveGuardrails, GUARDRAIL_DEFAULTS } from '@adxlens/core/execution';
import { requirePermission } from '@/server/guards';
import { getPageContext, requireFlag } from '@/server/page-context';
import { GuardrailsForm } from './guardrails-form';

/** P205 Guardrails của workspace (Owner): mặc định cố định, chỉ siết chặt hơn. Sau cờ duyệt hành động. */
export default async function GuardrailsPage() {
  const pc = await getPageContext();
  await requireFlag(pc, 'p2a_approve');
  requirePermission(pc, 'guardrails.manage');
  const g = await effectiveGuardrails(pc.ctx);
  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <GuardrailsForm initial={g} defaults={{ ...GUARDRAIL_DEFAULTS, excludeMetaIds: [] }} />
    </div>
  );
}
