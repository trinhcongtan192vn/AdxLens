import 'server-only';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { isStaff } from '@adxlens/core/tenancy';
import { deps } from './deps';
import { requireUser } from './page-context';

/** Trang nội bộ (AD01–AD04): chỉ đội AdxLens; người khác thấy 404 (không lộ có trang admin). */
export const requireStaff = cache(async () => {
  const user = await requireUser('/admin/flags');
  const staff = await isStaff(deps().db, user.id);
  if (!staff) notFound();
  return { user, staff };
});
