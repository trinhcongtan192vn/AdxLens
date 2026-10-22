import { forbidden, type Actor, type Role } from '@adxlens/core/shared';

/**
 * Ma trận quyền theo vai trò, rút từ cột Actor của ux-requirements mục 6
 * (AC1 owner, AC2 manager, AC3 buyer).
 */
export const PERMISSIONS = {
  'workspace.manage': ['owner'], // ST01
  'members.manage': ['owner'], // ST02
  'members.view': ['owner', 'manager'],
  'ownership.transfer': ['owner'],
  'billing.manage': ['owner'], // ST03
  'connections.manage': ['owner', 'manager'], // S02–S07 (S07 xóa dữ liệu: owner, xem bên dưới)
  'connections.delete': ['owner'], // S07
  'clients.manage': ['owner', 'manager'], // C01
  'reports.manage': ['owner', 'manager'], // R01–R05
  'insights.view': ['owner', 'manager', 'buyer'], // O01, D01–D04
  'findings.update': ['owner', 'manager', 'buyer'],
  'recommendations.update': ['owner', 'manager', 'buyer'], // P101
  'actions.view': ['owner', 'manager', 'buyer'],
  'guardrails.manage': ['owner'], // P205
  'write_scope.manage': ['owner'], // P201
  'automation.manage': ['owner', 'manager'], // P211–P215
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor.role, permission)) throw forbidden();
}

/** Owner/manager có clientAccess rỗng = mọi Client; buyer chỉ thấy Client được gán. */
export function canAccessClient(actor: Actor, clientId: string): boolean {
  if (actor.role === 'owner') return true;
  if (actor.clientAccess.length === 0) return actor.role === 'manager';
  return actor.clientAccess.includes(clientId);
}

export function assertClientAccess(actor: Actor, clientId: string): void {
  if (!canAccessClient(actor, clientId)) throw forbidden('Không có quyền với Client này');
}

/**
 * Quyền duyệt hành động P2a (Gate 1): owner và manager mặc định có; buyer chỉ khi owner cấp theo
 * từng Client.
 */
export function canApproveActions(actor: Actor, clientId: string): boolean {
  if (!canAccessClient(actor, clientId)) return false;
  if (actor.role === 'owner' || actor.role === 'manager') return true;
  return actor.approveClientIds.includes(clientId);
}
