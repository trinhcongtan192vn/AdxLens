import { scopedLogger } from '@adxlens/core/shared';
import { JOBS, parsePayload, type JobName } from '@adxlens/jobs';
import type { HandlerMap, JobHandler, WorkerServices } from './handler';

export class UnknownJobError extends Error {
  constructor(name: string) {
    super(`Không có handler cho job ${name}`);
    this.name = 'UnknownJobError';
  }
}

/**
 * Xử lý một job: validate payload bằng zod (L3 7.2), gắn logger có workspace_id/job_id, gọi handler.
 * Tách khỏi BullMQ để test trực tiếp.
 */
export async function dispatch(
  handlers: HandlerMap,
  deps: WorkerServices,
  job: { name: string; id: string; data: unknown },
): Promise<unknown> {
  if (!(job.name in JOBS)) throw new UnknownJobError(job.name);
  const name = job.name as JobName;
  const handler = handlers[name] as JobHandler<typeof name> | undefined;
  if (!handler) throw new UnknownJobError(name);
  const payload = parsePayload(name, job.data);
  const workspaceId = (payload as { workspaceId?: string }).workspaceId;
  const log = scopedLogger({
    job_id: job.id,
    job: name,
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
  });
  return handler(payload, { ...deps, log, jobId: job.id });
}
