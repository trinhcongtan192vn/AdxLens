/** Cộng chuỗi thập phân (tiền) không qua float (quy tắc 4): theo đơn vị 1/10000. */
export function addMoney(a: string, b: string): string {
  const scale = (v: string) => {
    const [i = '0', f = ''] = v.trim().split('.');
    const neg = i.startsWith('-');
    const n = BigInt(i.replace('-', '') + (f + '0000').slice(0, 4));
    return neg ? -n : n;
  };
  const sum = scale(a) + scale(b);
  const neg = sum < 0n;
  const abs = (neg ? -sum : sum).toString().padStart(5, '0');
  const int = abs.slice(0, -4);
  const frac = abs.slice(-4).replace(/0+$/, '');
  return `${neg ? '-' : ''}${int}${frac ? `.${frac}` : ''}`;
}

/** Ngày lịch theo múi giờ (YYYY-MM-DD). */
export function dateIn(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );
}
