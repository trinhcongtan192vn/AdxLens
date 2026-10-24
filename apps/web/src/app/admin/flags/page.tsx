import { getTranslations } from 'next-intl/server';
import { FLAG_KEYS, listFlagProposals } from '@adxlens/core/flags';
import { adminWorkspaceMatrix } from '@adxlens/core/ops';
import { PageHeader } from '@adxlens/ui';
import { requireStaff } from '@/server/admin-context';
import { deps } from '@/server/deps';
import { FlagMatrix } from './flag-matrix';
import { ProposalsPanel } from './proposals-panel';

export async function generateMetadata() {
  const t = await getTranslations('admin.flags');
  return { title: t('title') };
}

/** AD01 Ma trận workspace × cờ (L3 18.2). */
export default async function AdminFlagsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { staff, user } = await requireStaff();
  const t = await getTranslations('admin.flags');
  const q = (await searchParams).q ?? '';
  const [rows, proposals] = await Promise.all([
    adminWorkspaceMatrix(deps().db, { q }),
    listFlagProposals(deps().db, { status: 'pending' }),
  ]);
  return (
    <>
      <PageHeader title={t('title')} />
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
        canEnable={staff.canEnableFlags}
        flagKeys={[...FLAG_KEYS]}
        rows={rows.map((r) => ({
          id: r.id,
          name: r.name,
          ownerEmail: r.ownerEmail,
          accounts: r.accounts,
          createdAt: r.createdAt.toISOString(),
          flags: Object.fromEntries(FLAG_KEYS.map((k) => [k, r.flags[k]?.enabled ?? false])),
        }))}
      />
    </>
  );
}
