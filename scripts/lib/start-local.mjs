// Hàm thuần cho `pnpm start:local` (scripts/start-local.mjs). Tách riêng để test được.

const SUPABASE_KEYS = {
  SUPABASE_ANON_KEY: 'ANON_KEY',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'ANON_KEY',
  SUPABASE_SERVICE_ROLE_KEY: 'SERVICE_ROLE_KEY',
};

/** Đọc kết quả `supabase status -o env` thành object. */
export function parseStatusEnv(stdout) {
  return Object.fromEntries(
    stdout
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

/** Giá trị một biến trong nội dung file env (chuỗi rỗng nếu thiếu). */
export function envValue(text, key) {
  const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

/** Danh sách key Supabase còn trống trong .env.local. */
export function missingSupabaseKeys(text) {
  return Object.keys(SUPABASE_KEYS).filter((k) => !envValue(text, k));
}

/**
 * Điền key Supabase còn trống, KHÔNG đụng biến khác (khóa mã hóa token giữ nguyên — tạo lại sẽ làm token đã lưu
 * không giải mã được). Trả nội dung mới.
 */
export function fillSupabaseKeys(text, vars) {
  let out = text;
  for (const [key, from] of Object.entries(SUPABASE_KEYS)) {
    if (envValue(out, key) || !vars[from]) continue;
    const line = `${key}=${vars[from]}`;
    out = new RegExp(`^${key}=.*$`, 'm').test(out)
      ? out.replace(new RegExp(`^${key}=.*$`, 'm'), line)
      : `${out.replace(/\n?$/, '\n')}${line}\n`;
  }
  return out;
}
