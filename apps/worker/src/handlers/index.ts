import type { HandlerMap } from '../handler';
import { auditHandlers } from './audit';
import { executeHandlers } from './execute';
import { notifyHandlers } from './notify';
import { opsHandlers } from './ops';
import { recommendHandlers } from './recommend';
import { reconcileHandlers } from './reconcile';
import { reportHandlers } from './report';
import { rulesHandlers } from './rules';
import { syncHandlers } from './sync';

/** Handler theo tên job. Feature sau thêm handler của mình vào đây. */
export const handlers: HandlerMap = {
  ...auditHandlers,
  ...executeHandlers,
  ...notifyHandlers,
  ...opsHandlers,
  ...recommendHandlers,
  ...reconcileHandlers,
  ...reportHandlers,
  ...rulesHandlers,
  ...syncHandlers,
};
