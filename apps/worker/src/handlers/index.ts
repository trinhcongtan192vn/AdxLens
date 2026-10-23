import type { HandlerMap } from '../handler';
import { auditHandlers } from './audit';
import { notifyHandlers } from './notify';
import { opsHandlers } from './ops';
import { recommendHandlers } from './recommend';
import { reconcileHandlers } from './reconcile';
import { reportHandlers } from './report';
import { syncHandlers } from './sync';

/** Handler theo tên job. Feature sau thêm handler của mình vào đây. */
export const handlers: HandlerMap = {
  ...auditHandlers,
  ...notifyHandlers,
  ...opsHandlers,
  ...recommendHandlers,
  ...reconcileHandlers,
  ...reportHandlers,
  ...syncHandlers,
};
