import { z } from 'zod';
import { emailPreviews } from '@adxlens/core/notification';
import { route } from '@/server/route';

/** Xem trước mẫu email E01–E07 với dữ liệu mẫu cố định (staff). Không gửi email. */
export const GET = route({
  auth: 'staff',
  query: z.object({ locale: z.enum(['vi', 'en']).default('vi') }),
  handler: async (_ctx, { query }) => ({
    items: emailPreviews(query.locale).map((p) => ({
      key: p.key,
      subject: p.message.subject,
      html: p.message.html,
      text: p.message.text,
    })),
  }),
});
