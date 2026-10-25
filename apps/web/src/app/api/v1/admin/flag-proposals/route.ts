import { z } from 'zod';
import { FLAG_KEYS, listFlagProposals, proposeFlag } from '@adxlens/core/flags';
import { schema } from '@adxlens/db';
import { staffActor } from '@/server/admin-flags';
import { route } from '@/server/route';

/** Đề xuất bật cờ (ADR-0013): operator đề xuất, superadmin duyệt ở `[id]`. */
export const GET = route({
  auth: 'staff',
  query: z.object({ status: z.enum(schema.FLAG_PROPOSAL_STATUSES).optional() }),
  handler: async (ctx, { query }) => ({
    items: (await listFlagProposals(ctx.db, { status: query.status })).map((p) => ({
      id: p.id,
      workspace_id: p.workspaceId,
      workspace_name: p.workspaceName,
      flag: p.flagKey,
      reason: p.reason,
      status: p.status,
      proposer_email: p.proposerEmail,
      decision_note: p.decisionNote,
      decided_at: p.decidedAt,
      created_at: p.createdAt,
    })),
  }),
});

export const POST = route({
  auth: 'staff',
  body: z.object({
    workspace_id: z.string().uuid(),
    flag: z.enum(FLAG_KEYS),
    reason: z.string().trim().min(5).max(500),
  }),
  handler: async (ctx, { body }) => {
    const p = await proposeFlag(ctx.db, staffActor(ctx), {
      workspaceId: body.workspace_id,
      key: body.flag,
      reason: body.reason,
    });
    return { id: p.id, status: p.status };
  },
});
