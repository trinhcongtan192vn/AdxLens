import { describe, expect, it } from 'vitest';
import { signPayload, verifyPayload } from './signing';

const S = 's'.repeat(40);
describe('ký payload', () => {
  it('ký → kiểm đúng; sai secret, sửa nội dung, hết hạn → null', () => {
    const tok = signPayload({ r: 'abc' }, 60, S, 1_000_000);
    expect(verifyPayload<{ r: string }>(tok, S, 1_000_000)!.r).toBe('abc');
    expect(verifyPayload(tok, 'x'.repeat(40), 1_000_000)).toBeNull();
    const [body, mac] = tok.split('.');
    const forged = `${Buffer.from(JSON.stringify({ r: 'xyz', exp: 9e9 })).toString('base64url')}.${mac}`;
    expect(verifyPayload(forged, S)).toBeNull();
    expect(verifyPayload(`${body}.${mac}`, S, 1_000_000 + 61_000)).toBeNull();
    expect(verifyPayload(undefined, S)).toBeNull();
  });
});
