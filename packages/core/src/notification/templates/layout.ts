/** Khung HTML chung của email: thân 600px trong khung 700px (Penpot E01–E07). */
export function layout(body: string, footer = 'AdxLens · Chỉ đọc dữ liệu Meta Ads'): string {
  return `<!doctype html><html><body style="margin:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif;color:#0F172A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #E2E8F0;border-radius:8px">
<tr><td style="padding:16px 24px;border-bottom:1px solid #E2E8F0;color:#4F46E5;font-weight:600">AdxLens</td></tr>
<tr><td style="padding:24px;font-size:14px;line-height:20px">${body}</td></tr>
<tr><td style="padding:12px 24px;border-top:1px solid #E2E8F0;color:#64748B;font-size:12px">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}
