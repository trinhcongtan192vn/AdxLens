/**
 * LLM có tool-use cho AI agent (ADR-0019, 0022). Gọi Anthropic Messages / OpenAI Chat Completions bằng fetch (không
 * SDK), chỉ trong worker; key không bao giờ ghi log hay đưa vào thông điệp lỗi.
 */

export type AgentContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export type AgentTurn = { role: 'user' | 'assistant'; content: string | AgentContentBlock[] };

export type AgentToolSpec = { name: string; description: string; input_schema: Record<string, unknown> };

export type AgentLlmResponse = { content: AgentContentBlock[]; stopReason: string | null };

export type AgentLlm = {
  chat(input: {
    system: string;
    messages: AgentTurn[];
    tools: AgentToolSpec[];
    maxTokens: number;
  }): Promise<AgentLlmResponse>;
};

export function anthropicAgentClient(cfg: { apiKey: string; model: string; fetchImpl?: typeof fetch }): AgentLlm {
  const f = cfg.fetchImpl ?? fetch;
  return {
    async chat({ system, messages, tools, maxTokens }) {
      const res = await f('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, temperature: 0.2, system, messages, tools }),
      });
      if (!res.ok) throw new Error(`LLM_HTTP_${res.status}`);
      const data = (await res.json()) as { content?: AgentContentBlock[]; stop_reason?: string };
      return { content: data.content ?? [], stopReason: data.stop_reason ?? null };
    },
  };
}

type OpenAiMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

/** Chuyển hội thoại dạng khối (Anthropic) sang Chat Completions của OpenAI. */
export function toOpenAiMessages(system: string, turns: AgentTurn[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: 'system', content: system }];
  for (const t of turns) {
    if (typeof t.content === 'string') {
      out.push({ role: t.role, content: t.content });
      continue;
    }
    const text = t.content
      .filter((b): b is Extract<AgentContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (t.role === 'assistant') {
      const calls = t.content
        .filter((b): b is Extract<AgentContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
        .map((b) => ({
          id: b.id,
          type: 'function' as const,
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        }));
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    for (const b of t.content) {
      if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: b.content });
    }
    if (text) out.push({ role: 'user', content: text });
  }
  return out;
}

const OPENAI_STOP: Record<string, string> = { tool_calls: 'tool_use', stop: 'end_turn', length: 'max_tokens' };

/**
 * OpenAI Chat Completions có function calling (ADR-0022, khóa workspace tự mang). Cùng giao diện `AgentLlm` nên vòng
 * tool-use, kiểm số và công cụ dùng chung với Anthropic. Không gửi `temperature` (một số model chỉ nhận mặc định).
 */
export function openaiAgentClient(cfg: { apiKey: string; model: string; fetchImpl?: typeof fetch }): AgentLlm {
  const f = cfg.fetchImpl ?? fetch;
  return {
    async chat({ system, messages, tools, maxTokens }) {
      const res = await f('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          max_completion_tokens: maxTokens,
          messages: toOpenAiMessages(system, messages),
          tools: tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.input_schema },
          })),
        }),
      });
      if (!res.ok) throw new Error(`LLM_HTTP_${res.status}`);
      const data = (await res.json()) as {
        choices?: {
          finish_reason?: string;
          message?: {
            content?: string | null;
            tool_calls?: { id: string; function: { name: string; arguments: string } }[];
          };
        }[];
      };
      const choice = data.choices?.[0];
      const content: AgentContentBlock[] = [];
      if (choice?.message?.content) content.push({ type: 'text', text: choice.message.content });
      for (const c of choice?.message?.tool_calls ?? []) {
        let input: Record<string, unknown> = {};
        try {
          const v: unknown = JSON.parse(c.function.arguments || '{}');
          if (v && typeof v === 'object' && !Array.isArray(v)) input = v as Record<string, unknown>;
        } catch {
          input = {};
        }
        content.push({ type: 'tool_use', id: c.id, name: c.function.name, input });
      }
      const fr = choice?.finish_reason ?? null;
      return { content, stopReason: fr ? (OPENAI_STOP[fr] ?? fr) : null };
    },
  };
}
