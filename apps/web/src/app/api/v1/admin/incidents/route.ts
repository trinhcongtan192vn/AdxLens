import { z } from 'zod';
import { schema } from '@adxlens/db';
import { listIncidents } from '@adxlens/core/ops';
import { route } from '@/server/route';

/** AD03 danh sách sự cố (staff). */
export const GET = route({
  auth: 'staff',
  query: z.object({ status: z.enum(schema.INCIDENT_STATUSES).optional() }),
  handler: async (ctx, { query }) => ({
    items: (await listIncidents(ctx.db, { status: query.status ? [query.status] : undefined })).map((i) => ({
      id: i.id,
      kind: i.kind,
      severity: i.severity,
      source: i.source,
      title: i.title,
      status: i.status,
      occurrences: i.occurrences,
      workspace_id: i.workspaceId,
      created_at: i.createdAt,
      resolved_at: i.resolvedAt,
    })),
  }),
});
