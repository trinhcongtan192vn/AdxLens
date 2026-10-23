import 'server-only';
import { supabaseAdmin } from './supabase';

export type Bucket = 'brand' | 'reports' | 'creatives';

export type ObjectStorage = {
  upload(bucket: Bucket, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(bucket: Bucket, paths: string[]): Promise<void>;
  /** URL công khai (chỉ bucket public). */
  publicUrl(bucket: Bucket, path: string): string;
  /** URL có chữ ký, hết hạn sau `seconds` (L3 4.2: PDF 1 giờ). */
  signedUrl(bucket: Bucket, path: string, seconds: number): Promise<string>;
};

/** Supabase Storage bằng service role (chỉ phía server). */
export function supabaseStorage(): ObjectStorage {
  const sb = () => supabaseAdmin().storage;
  return {
    async upload(bucket, path, bytes, contentType) {
      const { error } = await sb().from(bucket).upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error(`Upload thất bại: ${error.message}`);
    },
    async remove(bucket, paths) {
      if (paths.length) await sb().from(bucket).remove(paths);
    },
    publicUrl(bucket, path) {
      return sb().from(bucket).getPublicUrl(path).data.publicUrl;
    },
    async signedUrl(bucket, path, seconds) {
      const { data, error } = await sb().from(bucket).createSignedUrl(path, seconds);
      if (error || !data) throw new Error('Không tạo được signed URL');
      return data.signedUrl;
    },
  };
}

/** Lưu trong bộ nhớ, dùng trong test. */
export function memoryStorage(): ObjectStorage & { files: Map<string, { bytes: Uint8Array; type: string }> } {
  const files = new Map<string, { bytes: Uint8Array; type: string }>();
  return {
    files,
    async upload(bucket, path, bytes, type) {
      files.set(`${bucket}/${path}`, { bytes, type });
    },
    async remove(bucket, paths) {
      for (const p of paths) files.delete(`${bucket}/${p}`);
    },
    publicUrl: (bucket, path) => `http://storage.test/${bucket}/${path}`,
    signedUrl: async (bucket, path, s) => `http://storage.test/${bucket}/${path}?exp=${s}`,
  };
}

/** Kiểm tra file ảnh theo nội dung (magic bytes), không tin content-type từ client. */
export function sniffImage(bytes: Uint8Array): 'image/png' | 'image/svg+xml' | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  const head = new TextDecoder().decode(bytes.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return null;
}

/** SVG không được chứa script/handler/link ngoài (logo hiển thị trên trang báo cáo công khai). */
export function isSafeSvg(bytes: Uint8Array): boolean {
  const s = new TextDecoder().decode(bytes).toLowerCase();
  return !/<script|on[a-z]+\s*=|javascript:|<foreignobject|xlink:href\s*=\s*["']?(?!#)|href\s*=\s*["']?(?:https?:|data:)/.test(
    s,
  );
}
