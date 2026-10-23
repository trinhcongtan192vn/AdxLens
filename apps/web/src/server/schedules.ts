import 'server-only';
import { z } from 'zod';
import type { listSchedules } from '@adxlens/core/reporting';

export const scheduleBody = z.object({
  client_id: z.string().uuid(),
  cadence: z.enum(['weekly', 'monthly']),
  weekday: z.number().int().min(1).max(7).nullable().optional(),
  month_day: z.number().int().min(1).max(28).nullable().optional(),
  send_hour: z.number().int().min(0).max(23),
  timezone: z.string().min(1).max(64),
  mode: z.enum(['auto', 'approval']),
  delivery: z.enum(['link', 'pdf']),
  locale: z.enum(['vi', 'en']).nullable().optional(),
  recipients: z.array(z.string().max(254)).min(1).max(10),
  enabled: z.boolean().optional(),
});

export function toInput(b: z.infer<typeof scheduleBody>) {
  return {
    clientId: b.client_id,
    cadence: b.cadence,
    weekday: b.weekday ?? null,
    monthDay: b.month_day ?? null,
    sendHour: b.send_hour,
    timezone: b.timezone,
    mode: b.mode,
    delivery: b.delivery,
    locale: b.locale ?? null,
    recipients: b.recipients,
    enabled: b.enabled,
  };
}

type Row = Awaited<ReturnType<typeof listSchedules>>[number];

export function scheduleDto(
  s: Omit<Row, 'deliveries' | 'clientName'> & Partial<Pick<Row, 'deliveries' | 'clientName'>>,
) {
  return {
    id: s.id,
    client: { id: s.clientId, name: s.clientName ?? null },
    cadence: s.cadence,
    weekday: s.weekday,
    month_day: s.monthDay,
    send_hour: s.sendHour,
    timezone: s.timezone,
    mode: s.mode,
    delivery: s.delivery,
    locale: s.locale,
    recipients: s.recipients,
    enabled: s.enabled,
    deliveries: (s.deliveries ?? []).map((d) => ({
      id: d.id,
      period: d.period,
      status: d.status,
      reason: d.reason,
      report_id: d.reportId,
      sent_at: d.sentAt?.toISOString() ?? null,
      created_at: d.createdAt.toISOString(),
    })),
  };
}
