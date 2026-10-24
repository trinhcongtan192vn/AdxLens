import { boolean, index, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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

export const API_KEY_SCOPES = ['read', 'propose'] as const;

/**
 * Khóa API theo workspace cho MCP server (ADR-0020). Chỉ lưu SHA-256 của khóa; khóa rõ hiện MỘT lần lúc tạo. Khóa chạy
 * với quyền của người tạo trong workspace; người tạo mất quyền thì khóa ngừng.
 */
export const apiKeys = app.table(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').notNull(),
    name: text('name').notNull(),
    /** 8 ký tự đầu để nhận diện trong danh sách (không đủ để dùng). */
    prefix: text('prefix').notNull(),
    hash: text('hash').notNull().unique(),
    scopes: text('scopes').array().notNull().default(['read']),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.workspaceId)],
);
