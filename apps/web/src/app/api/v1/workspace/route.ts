import { z } from 'zod';
import { getWorkspace, updateWorkspace } from '@adxlens/core/tenancy';
import { canonicalTimeZone, isValidTimeZone } from '@/lib/timezone';
import { route } from '@/server/route';

/** Thông tin workspace hiện tại (ST01). */
export const GET = route({
  auth: 'workspace',
  handler: async ({ db, workspaceId }) => {
    const ws = await getWorkspace({ db, workspaceId });
    return {
      id: ws.id,
      name: ws.name,
      default_locale: ws.defaultLocale,
      default_timezone: ws.defaultTimezone,
      default_currency: ws.defaultCurrency,
      brand: ws.brand,
      report_from_email: ws.reportFromEmail,
    };
  },
});

/** ST01: sửa tên, múi giờ, ngôn ngữ, thương hiệu, email gửi báo cáo (chỉ owner). */
export const PATCH = route({
  auth: 'workspace',
  permission: 'workspace.manage',
  body: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    defaultTimezone: z.string().refine(isValidTimeZone, 'timezone').transform(canonicalTimeZone).optional(),
    defaultLocale: z.enum(['vi', 'en']).optional(),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    reportFromEmail: z.string().trim().toLowerCase().email().nullable().optional(),
  }),
  handler: async (ctx, { body }) => {
    const current = await getWorkspace(ctx);
    const ws = await updateWorkspace(ctx, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.defaultTimezone ? { defaultTimezone: body.defaultTimezone } : {}),
      ...(body.defaultLocale ? { defaultLocale: body.defaultLocale } : {}),
      ...(body.primaryColor ? { brand: { ...current.brand, primary_color: body.primaryColor.toUpperCase() } } : {}),
      ...(body.reportFromEmail !== undefined ? { reportFromEmail: body.reportFromEmail } : {}),
    });
    return { id: ws.id, name: ws.name };
  },
});
