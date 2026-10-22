import { numeric, pgSchema, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Schema giao dịch và schema snapshot (L3 mục 5.1). */
export const app = pgSchema('app');
export const analytics = pgSchema('analytics');

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const workspaceId = () => uuid('workspace_id').notNull();

/** Tiền: numeric(18,4), đọc ra dạng chuỗi để không mất chính xác (CLAUDE.md quy tắc 4). */
export const money = (name: string) => numeric(name, { precision: 18, scale: 4 });

/** Tỷ lệ: numeric(10,6). */
export const ratio = (name: string) => numeric(name, { precision: 10, scale: 6 });
