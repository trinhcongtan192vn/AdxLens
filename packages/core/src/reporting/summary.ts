import type { ReportContent } from './report';

/**
 * Tóm tắt đầu báo cáo (PRD P0-16, L3 9). LLM CHỈ diễn giải số đã tính (CLAUDE.md quy tắc 5): mọi số trong
 * văn bản sinh ra phải khớp tập số đầu vào; lệch → sinh lại (tối đa 2 lần) rồi dùng tóm tắt mẫu không LLM.
 */

export type LlmClient = {
  complete(input: { system: string; user: string; maxTokens: number; temperature: number }): Promise<string>;
};

export type Fact = { label: string; value: number; text: string };

const nfFor =
  (locale: 'vi' | 'en') =>
  (v: number, o: Intl.NumberFormatOptions = {}) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN', o).format(v);

function pctChange(cur: number, prev: number): number | null {
  return prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;
}

/** Tập số được phép xuất hiện, kèm cách viết theo locale báo cáo. */
export function summaryFacts(c: ReportContent): Fact[] {
  const nf = nfFor(c.locale);
  const facts: Fact[] = [];
  const push = (label: string, value: number | null, text?: string) => {
    if (value === null || !Number.isFinite(value)) return;
    facts.push({ label, value, text: text ?? nf(value) });
  };
  push('accounts', c.accounts.length);
  for (const [i, a] of c.accounts.entries()) {
    // Nhãn theo thứ tự, không đưa tên tài khoản (dữ liệu người dùng) vào prompt (CLAUDE.md quy tắc 10).
    const p = `account_${i + 1}`;
    const money = (v: string | null) => (v === null ? null : Number(v));
    push(
      `${p}.spend (${a.currency})`,
      money(a.kpis.spend),
      nf(Number(a.kpis.spend), { maximumFractionDigits: a.currency === 'VND' ? 0 : 2 }),
    );
    push(`${p}.results`, a.kpis.results);
    if (a.kpis.cpa)
      push(
        `${p}.cpa (${a.currency})`,
        Number(a.kpis.cpa),
        nf(Number(a.kpis.cpa), { maximumFractionDigits: a.currency === 'VND' ? 0 : 2 }),
      );
    if (a.kpis.roas) push(`${p}.roas`, Number(a.kpis.roas), nf(Number(a.kpis.roas), { maximumFractionDigits: 2 }));
    if (a.kpis.ctr !== null) push(`${p}.ctr %`, Math.round(a.kpis.ctr * 10000) / 100);
    push(`${p}.spend_change %`, pctChange(Number(a.kpis.spend), Number(a.prevKpis.spend)));
    push(`${p}.results_change %`, pctChange(a.kpis.results, a.prevKpis.results));
    if (a.kpis.cpa && a.prevKpis.cpa) push(`${p}.cpa_change %`, pctChange(Number(a.kpis.cpa), Number(a.prevKpis.cpa)));
    push(`${p}.health`, a.health);
  }
  const high = c.findings.filter((f) => f.severity === 'high').length;
  push('findings', c.findings.length);
  push('findings_high', high);
  for (const [i, f] of c.findings.entries()) {
    if (f.impact)
      push(
        `finding_${i + 1}.impact (${f.impact.currency})`,
        Number(f.impact.amount),
        nf(Number(f.impact.amount), { maximumFractionDigits: f.impact.currency === 'VND' ? 0 : 2 }),
      );
  }
  return facts;
}

/** Tóm tắt mẫu (không LLM) — dùng khi không có API key hoặc LLM không qua kiểm tra số. */
export function templateSummary(c: ReportContent): string {
  const nf = nfFor(c.locale);
  const en = c.locale === 'en';
  const lines: string[] = [];
  for (const a of c.accounts) {
    const spend = nf(Number(a.kpis.spend), { maximumFractionDigits: a.currency === 'VND' ? 0 : 2 });
    const sc = pctChange(Number(a.kpis.spend), Number(a.prevKpis.spend));
    const rc = pctChange(a.kpis.results, a.prevKpis.results);
    const change = (v: number | null) => (v === null ? '' : `${v >= 0 ? '+' : ''}${nf(v)}%`);
    const head = c.accounts.length > 1 ? `${a.name}: ` : '';
    // Một tài khoản: câu đứng đầu tóm tắt → viết hoa chữ đầu ("Chi tiêu…"); nhiều tài khoản: sau "Tên: " giữ thường.
    const sentence = (s: string) => (head ? head + s : s.charAt(0).toUpperCase() + s.slice(1));
    lines.push(
      en
        ? sentence(
            `spend ${spend} ${a.currency}${sc === null ? '' : ` (${change(sc)} vs the previous period)`}, ${nf(a.kpis.results)} results${rc === null ? '' : ` (${change(rc)})`}${a.kpis.cpa ? `, cost per result ${nf(Number(a.kpis.cpa), { maximumFractionDigits: a.currency === 'VND' ? 0 : 2 })} ${a.currency}` : ''}.`,
          )
        : sentence(
            `chi tiêu ${spend} ${a.currency}${sc === null ? '' : ` (${change(sc)} so với kỳ trước)`}, ${nf(a.kpis.results)} kết quả${rc === null ? '' : ` (${change(rc)})`}${a.kpis.cpa ? `, chi phí mỗi kết quả ${nf(Number(a.kpis.cpa), { maximumFractionDigits: a.currency === 'VND' ? 0 : 2 })} ${a.currency}` : ''}.`,
          ),
    );
  }
  const high = c.findings.filter((f) => f.severity === 'high').length;
  lines.push(
    c.findings.length
      ? en
        ? `${nf(c.findings.length)} issues to address, ${nf(high)} of them high severity.`
        : `Có ${nf(c.findings.length)} vấn đề cần xử lý, trong đó ${nf(high)} vấn đề mức cao.`
      : en
        ? 'No significant issues this period.'
        : 'Không có vấn đề đáng kể trong kỳ.',
  );
  return lines.join(' ');
}

/**
 * Trích mọi số trong văn bản theo locale (vi: "1.234.567,8"; en: "1,234,567.8"), bỏ qua ngày dạng
 * dd/mm(/yyyy) và yyyy-mm-dd. Trả giá trị số.
 */
export function extractNumbers(text: string, locale: 'vi' | 'en'): number[] {
  const noDates = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ');
  const re =
    locale === 'en' ? /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g : /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;
  return [...noDates.matchAll(re)].map((m) => {
    const s = m[0];
    const norm = locale === 'en' ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
    return Number(norm);
  });
}

/** Số khớp tập cho phép khi bằng nhau sau làm tròn hợp lý (±0,5% tương đối hoặc ±0,05 tuyệt đối). */
export function checkNumbers(text: string, facts: Fact[], locale: 'vi' | 'en'): { ok: boolean; unknown: number[] } {
  const allowed = facts.map((f) => f.value);
  // Số trích ra không mang dấu (văn bản viết "giảm 12,5%"), nên so với |giá trị|.
  const near = (a: number, n: number) => Math.abs(Math.abs(a) - n) <= Math.max(0.05, Math.abs(a) * 0.005);
  const unknown = extractNumbers(text, locale).filter((n) => !allowed.some((a) => near(a, n)));
  return { ok: unknown.length === 0, unknown };
}

export const SUMMARY_MAX_ATTEMPTS = 3;

function prompt(c: ReportContent, facts: Fact[]) {
  const en = c.locale === 'en';
  const system = en
    ? 'You write a 2–4 sentence executive summary of a Meta Ads report for an agency client. Use ONLY the numbers listed under FACTS, written exactly as given. Do not invent, round differently, add, subtract or derive any number. Do not mention dates. Plain text, no lists, no markdown. Write in English.'
    : 'Bạn viết đoạn tóm tắt 2–4 câu cho báo cáo Meta Ads gửi khách của agency. CHỈ dùng các con số trong mục FACTS, viết đúng như đã cho. Không bịa, không làm tròn khác, không cộng trừ hay suy ra số mới. Không nhắc ngày tháng. Văn bản thường, không gạch đầu dòng, không markdown. Viết bằng tiếng Việt.';
  const findings = c.findings.map((f, i) => `- finding_${i + 1}: rule=${f.ruleId}, severity=${f.severity}`).join('\n');
  const user = `FACTS:\n${facts.map((f) => `- ${f.label}: ${f.text}`).join('\n')}\n\nFINDINGS (rule ids, no numbers):\n${findings || '- none'}\n\nKind: ${c.kind}.`;
  return { system, user };
}

export type SummaryResult = { text: string; source: 'llm' | 'template'; attempts: number; rejected: number[][] };

/** Sinh tóm tắt: LLM (nếu có) + kiểm tra số; không qua sau 3 lần → tóm tắt mẫu. */
export async function generateSummary(c: ReportContent, deps: { llm?: LlmClient | null }): Promise<SummaryResult> {
  const facts = summaryFacts(c);
  if (!deps.llm || c.accounts.length === 0)
    return { text: templateSummary(c), source: 'template', attempts: 0, rejected: [] };
  const { system, user } = prompt(c, facts);
  const rejected: number[][] = [];
  for (let attempt = 1; attempt <= SUMMARY_MAX_ATTEMPTS; attempt++) {
    let text: string;
    try {
      text = (await deps.llm.complete({ system, user, maxTokens: 600, temperature: 0.2 })).trim();
    } catch {
      break; // lỗi gọi LLM → tóm tắt mẫu, không chặn báo cáo
    }
    const check = checkNumbers(text, facts, c.locale);
    if (text && check.ok) return { text, source: 'llm', attempts: attempt, rejected };
    rejected.push(check.unknown);
  }
  return { text: templateSummary(c), source: 'template', attempts: SUMMARY_MAX_ATTEMPTS, rejected };
}

/** Client Anthropic Messages API (fetch, không SDK). Chỉ chạy trong worker; key không bao giờ ghi log. */
export function anthropicClient(cfg: { apiKey: string; model: string; fetchImpl?: typeof fetch }): LlmClient {
  const f = cfg.fetchImpl ?? fetch;
  return {
    async complete({ system, user, maxTokens, temperature }) {
      const res = await f('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: maxTokens,
          temperature,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!res.ok) throw new Error(`LLM_HTTP_${res.status}`);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      return (data.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');
    },
  };
}
