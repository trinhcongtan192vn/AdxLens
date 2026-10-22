import type { Db } from '@adxlens/db';
import type { World } from './world';

/**
 * Probe cách ly cho job theo workspace: `payload` cho workspace A; test băm dữ liệu B trước và sau
 * khi chạy job, phải không đổi. `prepare` tạo dữ liệu A cần thiết (ví dụ tài khoản QC).
 */
export type JobProbe = {
  prepare?: (db: Db, w: World) => Promise<Record<string, string>>;
  payload: (w: World, prepared?: Record<string, string>) => unknown;
};

export const JOB_PROBES: Record<string, JobProbe> = {};
