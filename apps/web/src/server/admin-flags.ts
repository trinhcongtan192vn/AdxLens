import 'server-only';
import { z } from 'zod';
import { FLAG_KEYS } from '@adxlens/core/flags';
import { registerRecommendationFlagChecks } from '@adxlens/core/recommendation';
import { registerReportingFlagChecks } from '@adxlens/core/reporting';
import { AppError } from '@adxlens/core/shared';

// Checklist kỹ thuật của các cờ (L3 18.3) — đăng ký một lần cho tiến trình web.
registerReportingFlagChecks();
registerRecommendationFlagChecks();

export function flagKeyParam(params: Record<string, string>) {
  const k = z.enum(FLAG_KEYS).safeParse(params.key);
  if (!k.success) throw new AppError('NOT_FOUND', 'Không tìm thấy');
  return k.data;
}
