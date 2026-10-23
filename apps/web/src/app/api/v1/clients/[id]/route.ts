import { z } from 'zod';
import { archiveClientAndRelease } from '@adxlens/core/connections';
import { getClient, updateClient } from '@adxlens/core/tenancy';
import { route, uuidParam } from '@/server/route';

/** C02: thông tin Client. */
export const GET = route({
  auth: 'workspace',
  handler: async (ctx) => {
    const c = await getClient(ctx, uuidParam(ctx, 'id'));
    return { id: c.id, name: c.name, report_locale: c.reportLocale, archived: c.archivedAt !== null };
  },
});

/** Đổi tên / ngôn ngữ báo cáo của Client. */
export const PATCH = route({
  auth: 'workspace',
  permission: 'clients.manage',
  body: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    reportLocale: z.enum(['vi', 'en']).nullable().optional(),
  }),
  handler: async (ctx, { body }) => {
    const id = uuidParam(ctx, 'id');
    await getClient(ctx, id);
    const c = await updateClient(ctx, id, body);
    return { id: c.id, name: c.name };
  },
});

/** Lưu trữ Client; tài khoản QC của Client về "chưa gán". */
export const DELETE = route({
  auth: 'workspace',
  permission: 'clients.manage',
  handler: async (ctx) => {
    const id = uuidParam(ctx, 'id');
    await getClient(ctx, id);
    await archiveClientAndRelease(ctx, id);
    return null;
  },
});
