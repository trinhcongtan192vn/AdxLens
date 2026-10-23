// Chỉ dùng trong test: dịch vụ worker với Meta mock, khóa test, enqueue và email ghi lại.
import { keysFromEnv } from '@adxlens/core/connections';
import { memoryEmailSender } from '@adxlens/core/notification';
import type { Db } from '@adxlens/db';
import { recordingEnqueue } from '@adxlens/jobs';
import { MockMetaRead } from '@adxlens/meta-client/mock';
import { signPayload } from '@adxlens/core/shared';
import type { WorkerServices } from './handler';

export const TEST_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');

export function testWorkerServices(db: Db, now?: () => Date) {
  const enqueue = recordingEnqueue();
  const email = memoryEmailSender();
  const throttled: { queue: string; ms: number }[] = [];
  const rendered: string[] = [];
  const uploads = new Map<string, Uint8Array>();
  const services: WorkerServices = {
    appUrl: 'http://localhost:3000',
    publicReportUrl: 'http://localhost:3000/r',
    llm: null,
    renderPdf: async (url) => {
      rendered.push(url);
      return new TextEncoder().encode('%PDF-1.7 test');
    },
    uploadReport: async (path, bytes) => {
      uploads.set(path, bytes);
    },
    sign: (payload, ttl) => signPayload(payload, ttl, 'test-signing-secret-0123456789abcdef'),
    throttleQueue: async (queue, ms) => {
      throttled.push({ queue, ms });
    },
    db,
    enqueue,
    email,
    meta: new MockMetaRead(now),
    tokenKeys: keysFromEnv({ TOKEN_ENC_KEY_V1: TEST_TOKEN_KEY }).keys,
  };
  return { services, enqueue, email, throttled, rendered, uploads };
}
