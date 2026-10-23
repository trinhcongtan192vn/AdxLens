import { listAdAccounts } from '@adxlens/core/connections';
import { getFinding } from '@adxlens/core/insight';
import { findingDto } from '@/server/findings';
import { route, uuidParam } from '@/server/route';
import { requestLocale } from '@/server/translate';

/** D03: chi tiết một phát hiện. */
export const GET = route({
  auth: 'workspace',
  handler: async (ctx) => {
    const f = await getFinding(ctx, uuidParam(ctx, 'id'));
    const currency = (await listAdAccounts(ctx)).find((a) => a.id === f.adAccountId)?.currency ?? null;
    return findingDto(f, requestLocale(ctx.req), currency);
  },
});
