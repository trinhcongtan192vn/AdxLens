import 'server-only';
import type { Db } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { db } from './db';
import { enqueue } from './redis';

export type ServerDeps = { db: Db; enqueue: Enqueue };

let override: ServerDeps | null = null;

/** Phụ thuộc phía server cho route và trang. Test thay bằng DB test và enqueue ghi lại. */
export function deps(): ServerDeps {
  return override ?? { db: db(), enqueue };
}

export function setDepsForTest(d: ServerDeps | null): void {
  if (process.env.APP_ENV !== 'test') throw new Error('setDepsForTest chỉ dùng trong test');
  override = d;
}
