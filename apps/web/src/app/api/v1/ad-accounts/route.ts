import { listAdAccounts } from '@adxlens/core/connections';
import { route } from '@/server/route';

/** S05/C01: tài khoản QC trong workspace kèm trạng thái gán. */
export const GET = route({
  auth: 'workspace',
  handler: async (ctx) => ({
    items: (await listAdAccounts(ctx)).map((a) => ({
      id: a.id,
      meta_account_id: a.metaAccountId,
      name: a.name,
      currency: a.currency,
      client_id: a.clientId,
      client_name: a.clientName,
      suggested_client: a.suggestedClientName,
      assignment_status: a.assignmentStatus,
      connection_status: a.connectionStatus,
    })),
  }),
});
