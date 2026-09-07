import { NextRequest, NextResponse } from 'next/server';
import { ai, CHAT_MODEL, SYSTEM_INSTRUCTION, chatSchema, aiGuard, audit, AuditAction } from '../shared';
import { sanitizePromptInput } from '../../../../../server/lib/promptSanitizer';

export async function POST(req: NextRequest) {
  const guard = await aiGuard(req);
  if (guard instanceof NextResponse) return guard;
  try {
    const parsed = chatSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    const { message, history } = parsed.data;

    let chatPrompt = '';
    if (history && history.length > 0) {
      history.forEach((h) => {
        chatPrompt += `${h.role === 'user' ? 'User' : 'Assistant'}: ${sanitizePromptInput(h.text)}\n`;
      });
    }
    chatPrompt += `User: ${sanitizePromptInput(message)}`;

    const response = await ai.models.generateContent({
      model: CHAT_MODEL,
      contents: chatPrompt,
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    });

    await audit({ event: 'COPILOT_CHAT', actor: guard.user.name, role: guard.user.role, action: AuditAction.COPILOT_CHAT, details: 'AI chat message' }).catch(() => {});
    return NextResponse.json({ success: true, text: response.text });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to get chatbot response' }, { status: 500 });
  }
}
