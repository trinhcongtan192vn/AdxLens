/**
 * LLM có tool-use cho AI agent (ADR-0019). Gọi Anthropic Messages API bằng fetch (không SDK), chỉ trong worker; key
 * không bao giờ ghi log hay đưa vào thông điệp lỗi.
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
