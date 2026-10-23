import type { HandlerMap } from '../handler';
import { auditHandlers } from './audit';
import { opsHandlers } from './ops';
import { reconcileHandlers } from './reconcile';
import { syncHandlers } from './sync';

/** Handler theo tên job. Feature sau thêm handler của mình vào đây. */
export const handlers: HandlerMap = {
  ...auditHandlers,
  ...opsHandlers,
  ...reconcileHandlers,
  ...syncHandlers,
};
