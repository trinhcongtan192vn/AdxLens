import { boolean, customType, index, integer, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
  source?: 'llm' | 'facts' | 'unconfigured' | 'stopped';
  /** Khóa nào trả lời: khóa workspace tự mang (ADR-0022) hay khóa nền tảng. */
  llm?: { via: 'workspace' | 'platform'; provider: string; model: string };
  /** Mã lỗi LLM khi rơi về bảng số (vd. LLM_HTTP_401 = khóa sai). */
  llmError?: string;
  facts?: { label: string; text: string }[];
  rejected?: number[][];
  /** Ngữ cảnh người dùng chọn (tài khoản / kỳ). */
  context?: {
    adAccountId?: string | null;
    period?: string;
    locale?: 'vi' | 'en';
    /** Đối tượng người dùng chọn trong bảng làm ngữ cảnh (Madgicx roadmap chat). Tên là dữ liệu từ Meta. */
    entities?: { level: 'campaign' | 'adset' | 'ad'; metaId: string }[];
  };
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

export const LLM_PROVIDERS = ['anthropic', 'openai', 'gemini', 'deepseek'] as const;

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/**
 * Khóa LLM workspace tự mang (BYOK, ADR-0022): AI agent chạy bằng tài khoản Anthropic / OpenAI của chính agency.
 * Khóa mã hóa AES-256-GCM như token Meta; web chỉ mã hóa, worker giải mã. RLS bật, không có policy cho người dùng.
 */
export const llmKeys = app.table('llm_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  provider: text('provider', { enum: LLM_PROVIDERS }).notNull(),
  model: text('model').notNull(),
  keyCiphertext: bytea('key_ciphertext').notNull(),
  keyVersion: integer('key_version').notNull(),
  /** 4 ký tự cuối để nhận diện (không đủ để dùng). */
  keyHint: text('key_hint').notNull(),
  updatedBy: uuid('updated_by').notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  /** Mã lỗi gần nhất từ nhà cung cấp (vd. LLM_HTTP_401) — không chứa khóa. */
  lastError: text('last_error'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Ứng dụng OAuth đăng ký động (RFC 7591) để kết nối MCP (ADR-0022 B): Claude, ChatGPT… Không thuộc workspace — là
 * ứng dụng, không phải dữ liệu nghiệp vụ. Chỉ client công khai (PKCE, không secret).
 */
export const oauthClients = app.table('oauth_clients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  redirectUris: text('redirect_uris').array().notNull(),
  createdAt: createdAt(),
});

/**
 * Quyền một người dùng cấp cho một ứng dụng trên một workspace (ADR-0022 B). Chỉ lưu SHA-256 của mã cấp quyền / access /
 * refresh token. Chạy với quyền của người cấp; người đó rời workspace thì grant ngừng.
 */
export const oauthGrants = app.table(
  'oauth_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.id, { onDelete: 'cascade' }),
    scopes: text('scopes').array().notNull().default(['read']),
    redirectUri: text('redirect_uri').notNull(),
    codeHash: text('code_hash').unique(),
    codeChallenge: text('code_challenge').notNull(),
    codeExpiresAt: timestamp('code_expires_at', { withTimezone: true }),
    accessHash: text('access_hash').unique(),
    accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }),
    refreshHash: text('refresh_hash').unique(),
    refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.workspaceId, t.userId)],
);
