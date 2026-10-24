import { z } from 'zod';
import { METRIC_KEYS } from '@adxlens/core/reporting';
import { updateProfile } from '@adxlens/core/tenancy';
import { LOCALE_COOKIE, LOCALES } from '@/i18n/locale';
import { PERIOD_COOKIE, PERIODS } from '@/lib/period';
import { W_KPIS_COOKIE, W_SCOPE_COOKIE } from '@/lib/workspace-nav';
import { json, route } from '@/server/route';

/** Ngôn ngữ giao diện (lưu vào hồ sơ + cookie), kỳ thời gian toàn cục (cookie, Gate 1 #2), phạm vi Workspace. */
export const POST = route({
  auth: 'user',
  body: z.object({
    locale: z.enum(LOCALES).optional(),
    period: z.enum(PERIODS).optional(),
    /** Giao diện Workspace: phạm vi "all" (agency) hoặc id tài khoản QC — server kiểm lại khi đọc. */
    wScope: z.union([z.literal('all'), z.string().uuid()]).optional(),
    /** 4 KPI trang chủ Workspace ("Customize" như Madgicx). */
    wKpis: z.array(z.enum(METRIC_KEYS)).length(4).optional(),
  }),
  handler: async ({ db, user }, { body }) => {
    if (body.locale) await updateProfile(db, user.id, { locale: body.locale });
    const res = json({ ok: true });
    const cookie = (name: string, value: string) =>
      res.headers.append('set-cookie', `${name}=${value}; Path=/; SameSite=Lax; Max-Age=31536000`);
    if (body.locale) cookie(LOCALE_COOKIE, body.locale);
    if (body.period) cookie(PERIOD_COOKIE, body.period);
    if (body.wScope) cookie(W_SCOPE_COOKIE, body.wScope);
    if (body.wKpis) cookie(W_KPIS_COOKIE, body.wKpis.join('.'));
    return res;
  },
});
