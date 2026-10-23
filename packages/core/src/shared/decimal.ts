/**
 * Số thập phân cố định cho tiền và tỷ lệ (CLAUDE.md quy tắc 4): mọi phép cộng/trừ/so sánh trên BigInt
 * đã nhân 10^scale, không đi qua float.
 */
export const MONEY_SCALE = 4;

/** "123.45" → 1234500n (scale 4). Chuỗi không hợp lệ → lỗi; làm tròn nửa lên khi dư chữ số. */
export function toScaled(v: string | number | bigint, scale = MONEY_SCALE): bigint {
  if (typeof v === 'bigint') return v * 10n ** BigInt(scale);
  const s = String(v).trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`Số không hợp lệ: ${s.slice(0, 32)}`);
  const [, sign, int, frac = ''] = m;
  const padded = (frac + '0'.repeat(scale + 1)).slice(0, scale + 1);
  let n = BigInt(int!) * 10n ** BigInt(scale) + BigInt(padded.slice(0, scale) || '0');
  if (Number(padded[scale]) >= 5) n += 1n;
  return sign === '-' ? -n : n;
}

/** 1234500n → "123.4500". */
export function fromScaled(n: bigint, scale = MONEY_SCALE): string {
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const base = 10n ** BigInt(scale);
  const frac = scale ? `.${String(abs % base).padStart(scale, '0')}` : '';
  return `${neg ? '-' : ''}${abs / base}${frac}`;
}

export function sumDecimal(values: (string | null | undefined)[], scale = MONEY_SCALE): string {
  return fromScaled(
    values.reduce((t, v) => t + (v ? toScaled(v, scale) : 0n), 0n),
    scale,
  );
}

/** Trần của numeric(10,6). */
const PCT_CAP = 9_999_999_999n; // 9999.999999 × 10^6

/**
 * Độ lệch phần trăm (L3 6.4): |internal − meta| / max(meta, ε) × 100, kết quả 6 chữ số thập phân
 * (numeric(10,6)), làm tròn nửa lên. Cả hai bằng 0 → 0; meta = 0 còn internal ≠ 0 → trần.
 */
export function deltaPct(internal: string | number, meta: string | number): string {
  const i = toScaled(String(internal));
  const m = toScaled(String(meta));
  const diff = i > m ? i - m : m - i;
  if (diff === 0n) return '0.000000';
  const denom = m < 0n ? -m : m;
  if (denom === 0n) return fromScaled(PCT_CAP, 6);
  const scaled = (diff * 100n * 10n ** 6n * 2n + denom) / (denom * 2n);
  return fromScaled(scaled > PCT_CAP ? PCT_CAP : scaled, 6);
}

/** So sánh hai chuỗi thập phân: -1, 0, 1. */
export function compareDecimal(a: string, b: string, scale = 6): number {
  const x = toScaled(a, scale);
  const y = toScaled(b, scale);
  return x === y ? 0 : x < y ? -1 : 1;
}

/** Tiền × tỷ lệ (tỷ lệ làm tròn 6 chữ số), kết quả numeric 4 chữ số — dùng cho tác động ước tính. */
export function mulRatio(amount: string, ratio: number, scale = MONEY_SCALE): string {
  if (!Number.isFinite(ratio)) throw new Error('Tỷ lệ không hợp lệ');
  const r = BigInt(Math.round(ratio * 1_000_000));
  const a = toScaled(amount, scale);
  const prod = a * r;
  const half = prod >= 0n ? 500_000n : -500_000n;
  return fromScaled((prod + half) / 1_000_000n, scale);
}

/** a / b cho số thập phân (vd. ROAS = doanh thu / chi tiêu), làm tròn nửa lên `scale` chữ số. b = 0 → null. */
export function divDecimal(a: string, b: string, scale = 4): string | null {
  const x = toScaled(a, MONEY_SCALE);
  const y = toScaled(b, MONEY_SCALE);
  if (y === 0n) return null;
  const num = x * 10n ** BigInt(scale) * 2n;
  const den = y * 2n;
  const q = (num + (num >= 0n === den > 0n ? den / 2n : -den / 2n)) / den;
  return fromScaled(q, scale);
}
