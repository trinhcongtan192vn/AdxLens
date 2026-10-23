import type { TokenKeys } from '@adxlens/core/connections';
import type { EmailSender } from '@adxlens/core/notification';
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
  email: EmailSender;
  /** URL gốc của web app (link trong email). */
  appUrl: string;
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
