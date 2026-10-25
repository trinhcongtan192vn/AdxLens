import 'server-only';

/** Cookie mở khóa link có mật khẩu (R06), riêng cho từng link. */
export const shareUnlockCookie = (linkId: string) => `share_${linkId.slice(0, 8)}`;
