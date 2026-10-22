import type { HandlerMap } from '../handler';
import { opsHandlers } from './ops';

/** Handler theo tên job. Feature sau thêm handler của mình vào đây. */
export const handlers: HandlerMap = {
  ...opsHandlers,
};
