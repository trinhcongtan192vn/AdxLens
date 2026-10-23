import type { MetaCallAudit } from '@adxlens/meta-client';
import { HttpMetaWrite, type MetaWriteApi } from '@adxlens/meta-client/write';
import { MockMetaWrite } from '@adxlens/meta-client/write-mock';

let mockWriter: MockMetaWrite | null = null;

/**
 * Lớp ghi Meta cho worker (chỉ execution được tạo). `mock` = META_MOCK=1 ở local/test; bản thật luôn không
 * retry ghi (ADR-0008 mục 3).
 */
export type MetaWriter = MetaWriteApi;

export function createMetaWriter(cfg: {
  mock: boolean;
  apiVersion: string;
  appSecret?: string | null;
  onAudit?: (a: MetaCallAudit) => void | Promise<void>;
}): MetaWriter {
  if (cfg.mock) {
    mockWriter ??= new MockMetaWrite();
    return mockWriter;
  }
  return new HttpMetaWrite({ apiVersion: cfg.apiVersion, appSecret: cfg.appSecret ?? undefined, onAudit: cfg.onAudit });
}

/** Bản ghi giả mới (có cài lỗi theo kịch bản) — cho diễn tập sự cố / test ở local; không dùng ở staging. */
export function newMockMetaWriter(): MockMetaWrite {
  return new MockMetaWrite();
}
