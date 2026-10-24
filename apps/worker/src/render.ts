import { createClient } from '@supabase/supabase-js';
import { chromium, type Browser } from 'playwright';

/** Lưu tệp vào Supabase Storage bằng service role (worker-render, L3 9). */
export type WorkerStorage = {
  upload(bucket: 'reports', path: string, bytes: Uint8Array, contentType: string): Promise<void>;
};

export function supabaseWorkerStorage(url: string, serviceKey: string): WorkerStorage {
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  return {
    async upload(bucket, path, bytes, contentType) {
      const { error } = await sb.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error(`Upload thất bại: ${error.message}`);
    },
  };
}

let browser: Promise<Browser> | null = null;

/**
 * In trang thành PDF A4 (L3 9: Playwright `page.pdf`, print CSS). Trình duyệt dùng lại giữa các job;
 * mỗi job một context riêng. Chỉ mở URL nội bộ đã ký.
 */
export async function renderPdf(url: string): Promise<Uint8Array> {
  browser ??= chromium.launch();
  const ctx = await (await browser).newContext();
  try {
    const page = await ctx.newPage();
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    if (!res || !res.ok()) throw new Error(`PRINT_PAGE_${res?.status() ?? 'NO_RESPONSE'}`);
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return new Uint8Array(pdf);
  } finally {
    await ctx.close();
  }
}

export async function closeRenderer(): Promise<void> {
  if (browser) await (await browser).close();
  browser = null;
}
