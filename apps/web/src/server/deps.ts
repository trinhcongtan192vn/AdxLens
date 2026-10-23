import 'server-only';
import { getEnv } from '@adxlens/config/env';
import type { Db } from '@adxlens/db';
import { smtpEmailSender, type EmailSender } from '@adxlens/core/notification';
import type { Enqueue } from '@adxlens/jobs';
import { db } from './db';
import { enqueue } from './redis';
import { supabaseStorage, type ObjectStorage } from './storage';

export type ServerDeps = { db: Db; enqueue: Enqueue; email: EmailSender; storage: ObjectStorage };

let override: ServerDeps | null = null;
let email: EmailSender | undefined;

function emailSender(): EmailSender {
  if (!email) {
    const env = getEnv();
    email = smtpEmailSender({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.EMAIL_FROM,
    });
  }
  return email;
}

/** Phụ thuộc phía server cho route và trang. Test thay bằng DB test, enqueue và email ghi lại. */
export function deps(): ServerDeps {
  return override ?? { db: db(), enqueue, email: emailSender(), storage: supabaseStorage() };
}

export function setDepsForTest(d: ServerDeps | null): void {
  if (process.env.APP_ENV !== 'test') throw new Error('setDepsForTest chỉ dùng trong test');
  override = d;
}
