import 'server-only';
import { redirect } from 'next/navigation';
import { can, type Permission } from '@adxlens/core/tenancy';
import type { PageContext } from './page-context';

/** Trang chỉ cho vai trò có quyền; không có quyền → X02 403. */
export function requirePermission(pc: PageContext, permission: Permission): void {
  if (!can(pc.actor.role, permission)) redirect('/forbidden');
}
