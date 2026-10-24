import { z } from 'zod';
import { createSchedule, listSchedules } from '@adxlens/core/reporting';
import { route } from '@/server/route';
import { scheduleBody, scheduleDto, toInput } from '@/server/schedules';

/** R05: lịch gửi báo cáo + lần gửi gần nhất. */
export const GET = route({
  auth: 'workspace',
  permission: 'reports.manage',
  flag: 'p0_reports',
  query: z.object({ client_id: z.string().uuid().optional() }),
  handler: async (ctx, { query }) => ({
    items: (await listSchedules(ctx, { clientId: query.client_id })).map(scheduleDto),
  }),
});

export const POST = route({
  auth: 'workspace',
  permission: 'reports.manage',
  flag: 'p0_reports',
  body: scheduleBody,
  handler: async (ctx, { body }) =>
    Response.json(scheduleDto(await createSchedule(ctx, toInput(body))), { status: 201 }),
});
