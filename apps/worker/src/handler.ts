import type { GoogleAnalyticsApi, ShopeeApi, ShopifyApi } from '@adxlens/store-client';
import type { AgentLlm } from '@adxlens/core/agent';
import type { TokenKeys } from '@adxlens/core/connections';
import type { MetaWriter } from '@adxlens/core/execution';
import type { EmailSender } from '@adxlens/core/notification';
import type { LlmClient } from '@adxlens/core/reporting';
import type { Logger } from '@adxlens/core/shared';
import type { Db } from '@adxlens/db';
import type { Enqueue, JobName, JobPayload } from '@adxlens/jobs';
import type { MetaReadApi } from '@adxlens/meta-client';

/** Phụ thuộc chung truyền cho mọi handler. Chỉ worker có khóa giải mã token (CLAUDE.md quy tắc 2). */
export type WorkerServices = {
  db: Db;
  enqueue: Enqueue;
  meta: MetaReadApi;
  tokenKeys: TokenKeys;
  /** Lớp ghi Meta — chỉ handler `execute:*` dùng, qua Execution Gateway (ADR-0008). */
  metaWriter: MetaWriter;
  /** ADR-0029: Shopify (chỉ đọc). */
  shopify: ShopifyApi;
  ga4: GoogleAnalyticsApi;
  shopee: ShopeeApi;
  email: EmailSender;
  /** URL gốc của web app (link trong email). */
  appUrl: string;
  /** Gốc link báo cáo công khai (`PUBLIC_REPORT_URL`). */
  publicReportUrl: string;
  /** LLM cho tóm tắt báo cáo; null khi không cấu hình ANTHROPIC_API_KEY (dùng tóm tắt mẫu). */
  llm: LlmClient | null;
  /** LLM có tool-use cho AI agent (ADR-0019); null khi không có ANTHROPIC_API_KEY. */
  agentLlm: AgentLlm | null;
  /** Model của khóa nền tảng (ghi vào tin trả lời). */
  agentLlmModel?: string;
  /** In trang nội bộ thành PDF A4 (Playwright). */
  renderPdf: (url: string) => Promise<Uint8Array>;
  /** Lưu tệp báo cáo (bucket `reports`). */
  uploadReport: (path: string, bytes: Uint8Array) => Promise<void>;
  /** ADR-0027: đọc / ghi ảnh bản nháp creative (bucket private `creatives`). */
  readCreativeImage: (path: string) => Promise<Uint8Array>;
  saveCreativeImage: (path: string, bytes: Uint8Array, contentType: string) => Promise<void>;
  /** Ký payload cho URL nội bộ (cùng secret với web). */
  sign: (payload: Record<string, unknown>, ttlSeconds: number) => string;
  /** Hoãn xử lý một queue trong `ms` (playbook `meta_rate_limited`). */
  throttleQueue: (queue: 'sync', ms: number) => Promise<void>;
};

export type JobDeps = WorkerServices & {
  log: Logger;
  jobId: string;
  /** Lần thử cuối (BullMQ không retry nữa): handler ghi lỗi bền vững trước khi ném. */
  finalAttempt: boolean;
};

export type JobHandler<N extends JobName> = (payload: JobPayload<N>, deps: JobDeps) => Promise<unknown>;

export type HandlerMap = { [N in JobName]?: JobHandler<N> };
