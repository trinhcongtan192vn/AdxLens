import { deleteSchedule, updateSchedule } from '@adxlens/core/reporting';
import { route, uuidParam } from '@/server/route';
import { scheduleBody, scheduleDto, toInput } from '@/server/schedules';

export const PATCH = route({
  auth: 'workspace',
  permission: 'reports.manage',
  flag: 'p0_reports',
  body: scheduleBody,
  handler: async (ctx, { body }) => scheduleDto(await updateSchedule(ctx, uuidParam(ctx, 'id'), toInput(body))),
});

export const DELETE = route({
  auth: 'workspace',
  permission: 'reports.manage',
  flag: 'p0_reports',
  handler: async (ctx) => {
    await deleteSchedule(ctx, uuidParam(ctx, 'id'));
    return null;
  },
});
