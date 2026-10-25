import {
  agentMessageOwner,
  runAgentReply,
  runAiImage,
  workspaceAgentLlm,
  workspaceImageGenerator,
} from '@adxlens/core/agent';
import { isEnabled } from '@adxlens/core/flags';
import { generateWeeklyActions } from '@adxlens/core/recommendation';
import { resolveActor } from '@adxlens/core/tenancy';
import type { HandlerMap } from '../handler';

export const recommendHandlers: HandlerMap = {
  // Weekly Action List (P1-04). Kiểm cờ ở đầu job (CLAUDE.md quy tắc 7).
  'recommend:build': async (p, { db, enqueue, log }) => {
    const ctx = { db, workspaceId: p.workspaceId };
    if (!(await isEnabled(ctx, 'p1_recommendations'))) return { status: 'flag_off' };
    const r = await generateWeeklyActions(ctx, p.week, { enqueue });
    log.info({ week: p.week, ...r }, 'weekly actions');
    return { status: 'ok', ...r };
  },

  // AI agent (ADR-0019): chạy với quyền của người hỏi (buyer chỉ thấy Client được gán). Cờ P1 kiểm trong runAgentReply.
  // Workspace có khóa tự mang (ADR-0022) thì dùng khóa đó; không thì khóa nền tảng. Khóa workspace lỗi KHÔNG rơi sang
  // khóa nền tảng (trả bảng số + mã lỗi để Owner sửa khóa).
  // ADR-0027: AI tạo ảnh (khóa OpenAI của workspace; kiểm cờ trong runAiImage).
  'recommend:creative_image': async (p, { db, tokenKeys, saveCreativeImage, log }) => {
    const ctx = { db, workspaceId: p.workspaceId };
    const r = await runAiImage(ctx, p.draftId, {
      generator: await workspaceImageGenerator(ctx, tokenKeys),
      save: saveCreativeImage,
    });
    log.info({ draft_id: p.draftId, ...r }, 'creative image');
    return r;
  },
  'recommend:agent_reply': async (p, { db, agentLlm, agentLlmModel, tokenKeys, log }) => {
    const userId = await agentMessageOwner({ db, workspaceId: p.workspaceId }, p.messageId);
    if (!userId) return { status: 'missing' };
    const actor = await resolveActor(db, p.workspaceId, userId);
    if (!actor) return { status: 'no_member' };
    const own = await workspaceAgentLlm({ db, workspaceId: p.workspaceId }, tokenKeys);
    const r = await runAgentReply(
      { db, workspaceId: p.workspaceId, actor },
      p.messageId,
      own
        ? { llm: own.llm, llmInfo: { via: 'workspace', provider: own.provider, model: own.model } }
        : {
            llm: agentLlm,
            ...(agentLlm ? { llmInfo: { via: 'platform', provider: 'anthropic', model: agentLlmModel ?? '' } } : {}),
          },
    );
    log.info({ source: r.source, via: own ? 'workspace' : 'platform' }, 'agent reply');
    return r;
  },
};
