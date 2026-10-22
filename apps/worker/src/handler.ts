import type { Db } from '@adxlens/db';
import type { Logger } from '@adxlens/core/shared';
import type { Enqueue, JobName, JobPayload } from '@adxlens/jobs';

/** Phụ thuộc chung truyền cho mọi handler. */
export type JobDeps = {
  db: Db;
  log: Logger;
  enqueue: Enqueue;
  jobId: string;
};

export type JobHandler<N extends JobName> = (
  payload: JobPayload<N>,
  deps: JobDeps,
) => Promise<unknown>;

export type HandlerMap = { [N in JobName]?: JobHandler<N> };
