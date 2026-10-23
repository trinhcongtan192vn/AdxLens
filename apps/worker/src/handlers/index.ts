import type { HandlerMap } from '../handler';
import { opsHandlers } from './ops';
import { syncHandlers } from './sync';

/** Handler theo tên job. Feature sau thêm handler của mình vào đây. */
export const handlers: HandlerMap = {
  ...opsHandlers,
  ...syncHandlers,
};
