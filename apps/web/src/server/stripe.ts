import 'server-only';
import { getEnv } from '@adxlens/config/env';
import { httpStripe, type StripeApi } from '@adxlens/core/billing';
import { AppError } from '@adxlens/core/shared';

let override: StripeApi | null = null;
/** Test thay Stripe bằng bản giả. */
export function setStripeForTests(s: StripeApi | null): void {
  override = s;
}

/** Stripe test mode (027). Chưa cấu hình khóa → 503, không bao giờ gọi Stripe live ngoài khóa trong env. */
export function stripe(): StripeApi {
  if (override) return override;
  const key = getEnv().STRIPE_SECRET_KEY;
  if (!key) throw new AppError('SERVICE_UNAVAILABLE', 'Chưa cấu hình thanh toán Stripe');
  return httpStripe(key);
}
