import { boolean, index, jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, updatedAt } from './_common';
import { workspaces } from './tenancy';

/** Hội thoại AI agent (ADR-0019), theo workspace + người dùng; xóa theo workspace. */
export const agentThreads = app.table(
  'agent_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    title: text('title').notNull(),
    favorite: boolean('favorite').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.workspaceId, t.userId, t.updatedAt)],
);

export const AGENT_ROLES = ['user', 'assistant'] as const;
export const AGENT_MESSAGE_STATUSES = ['pending', 'done', 'error'] as const;

export type AgentMessageData = {
  /** Công cụ đã gọi (tên + tham số), để hiện "AdxLens đã xem gì". */
  tools?: { name: string; input: Record<string, unknown> }[];
  /** Đề xuất hành động ghi — CHỈ là thẻ; người dùng duyệt qua Execution Gateway (ADR-0019). */
  proposals?: {
    actionType: string;
    adAccountId: string;
    targetMetaId: string;
    targetName: string | null;
    newDailyBudget?: string | null;
    reason?: string;
  }[];
  /** llm: qua kiểm tra số; facts: trả bảng số từ công cụ vì LLM không qua kiểm tra / không có key. */
  source?: 'llm' | 'facts' | 'unconfigured';
  facts?: { label: string; text: string }[];
  rejected?: number[][];
  /** Ngữ cảnh người dùng chọn (tài khoản / kỳ). */
  context?: { adAccountId?: string | null; period?: string };
};

export const agentMessages = app.table(
  'agent_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => agentThreads.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    role: text('role', { enum: AGENT_ROLES }).notNull(),
    content: text('content').notNull().default(''),
    status: text('status', { enum: AGENT_MESSAGE_STATUSES }).notNull().default('done'),
    data: jsonb('data').$type<AgentMessageData>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.workspaceId, t.threadId, t.createdAt), index().on(t.workspaceId, t.userId, t.createdAt)],
);
