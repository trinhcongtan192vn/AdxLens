import { escapeHtml, type EmailMessage } from '../email';
import { layout } from './layout';

/** Xác nhận yêu cầu xóa dữ liệu (P0-22): `scheduled` khi ngắt kết nối, `done` khi đã xóa xong. */
export function dataDeletionEmail(input: {
  locale: 'vi' | 'en';
  to: string;
  workspaceName: string;
  code: string;
  phase: 'scheduled' | 'done';
  /** Ngày dữ liệu sẽ bị xóa (đã định dạng), dùng khi `scheduled`. */
  purgeBy: string;
  statusLink: string;
}): EmailMessage {
  const en = input.locale === 'en';
  const subject = en
    ? input.phase === 'done'
      ? `Ad data of ${input.workspaceName} has been deleted (${input.code})`
      : `Meta disconnected from ${input.workspaceName} (${input.code})`
    : input.phase === 'done'
      ? `Đã xóa dữ liệu quảng cáo của ${input.workspaceName} (${input.code})`
      : `Đã ngắt kết nối Meta khỏi ${input.workspaceName} (${input.code})`;
  const body = en
    ? input.phase === 'done'
      ? 'All synced ad data for this connection has been deleted.'
      : `The access token was deleted immediately. Synced ad data will be deleted on ${input.purgeBy}. Reconnecting Meta before then cancels the deletion.`
    : input.phase === 'done'
      ? 'Toàn bộ dữ liệu quảng cáo đã đồng bộ của kết nối này đã được xóa.'
      : `Token truy cập đã được xóa ngay. Dữ liệu quảng cáo đã đồng bộ sẽ bị xóa vào ${input.purgeBy}. Kết nối lại Meta trước ngày đó sẽ hủy việc xóa.`;
  const codeLine = en ? `Confirmation code: ${input.code}` : `Mã xác nhận: ${input.code}`;
  const linkLabel = en ? 'Check deletion status' : 'Xem trạng thái xóa';
  return {
    to: input.to,
    subject,
    text: `${subject}\n${body}\n${codeLine}\n${linkLabel}: ${input.statusLink}`,
    html: layout(
      `<h1 style="font-size:18px">${escapeHtml(subject)}</h1><p>${body}</p><p><b>${escapeHtml(codeLine)}</b></p>
       <p><a href="${input.statusLink}">${linkLabel}</a></p>`,
    ),
  };
}
