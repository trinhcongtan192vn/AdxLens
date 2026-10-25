import { getTranslations } from 'next-intl/server';
import { PLAN_KEYS } from '@adxlens/core/billing';
import { adminFlagStates, FLAG_KEYS, flagScopeHistory, listFlagProposals, readFlagScopes } from '@adxlens/core/flags';
import { adminWorkspaceMatrix } from '@adxlens/core/ops';
import { PageHeader } from '@adxlens/ui';
import { requireStaff } from '@/server/admin-context';
import { deps } from '@/server/deps';
import { FlagMatrix } from './flag-matrix';
import { ProposalsPanel } from './proposals-panel';
import { ScopePanels } from './scope-panels';

export async function generateMetadata() {
  const t = await getTranslations('admin.flags');
  return { title: t('title') };
}

/** AD01 (ADR-0024): cờ toàn app + ma trận gói + ngoại lệ theo workspace. */
export default async function AdminFlagsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { staff, user } = await requireStaff();
  const t = await getTranslations('admin.flags');
  const q = (await searchParams).q ?? '';
  const db = deps().db;
  const [rows, proposals, scopes, scopeLog] = await Promise.all([
    adminWorkspaceMatrix(db, { q }),
    listFlagProposals(db, { status: 'pending' }),
    readFlagScopes(db),
    flagScopeHistory(db, 30),
  ]);
  const states = await adminFlagStates(
    db,
    rows.map((r) => r.id),
  );
  return (
    <>
      <PageHeader title={t('title')} />
      <ScopePanels
        flagKeys={[...FLAG_KEYS]}
        planKeys={[...PLAN_KEYS]}
        global={scopes.global}
        plans={scopes.plans}
        canEdit={staff.role === 'superadmin'}
        history={scopeLog.map((h) => ({
          scope: h.scope,
          plan: h.planKey,
          flag: h.flagKey,
          old_value: h.oldValue,
          new_value: h.newValue,
          reason: h.reason,
          at: h.at.toISOString(),
        }))}
      />
      <ProposalsPanel
        canDecide={staff.role === 'superadmin'}
        items={proposals.map((p) => ({
          id: p.id,
          workspaceId: p.workspaceId,
          workspaceName: p.workspaceName,
          flag: p.flagKey,
          reason: p.reason,
          proposerEmail: p.proposerEmail,
          mine: p.proposedBy === user.id,
          createdAt: p.createdAt.toISOString(),
        }))}
      />
      <FlagMatrix
        q={q}
        canEnable={staff.role === 'superadmin'}
        flagKeys={[...FLAG_KEYS]}
        rows={rows.map((r) => ({
          id: r.id,
          name: r.name,
          ownerEmail: r.ownerEmail,
          accounts: r.accounts,
          createdAt: r.createdAt.toISOString(),
          plan: states.get(r.id)?.plan ?? 'free',
          flags: Object.fromEntries(FLAG_KEYS.map((k) => [k, states.get(r.id)?.effective[k] ?? false])),
          overrides: states.get(r.id)?.overrides ?? {},
        }))}
      />
    </>
  );
}
