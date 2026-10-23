import { billingProfileInput, getBillingProfile, saveBillingProfile } from '@adxlens/core/billing';
import { route } from '@/server/route';

const dto = (p: Awaited<ReturnType<typeof saveBillingProfile>> | null) =>
  p && { company_name: p.companyName, tax_code: p.taxCode, address: p.address, invoice_email: p.invoiceEmail };

/** ST03 thông tin xuất hóa đơn. */
export const GET = route({
  auth: 'workspace',
  permission: 'billing.manage',
  handler: async (ctx) => ({ profile: dto(await getBillingProfile(ctx)) }),
});

export const PUT = route({
  auth: 'workspace',
  permission: 'billing.manage',
  body: billingProfileInput,
  handler: async (ctx, { body }) => ({ profile: dto(await saveBillingProfile(ctx, body)) }),
});
