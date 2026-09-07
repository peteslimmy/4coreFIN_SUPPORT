import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ai, CHAT_MODEL, SYSTEM_INSTRUCTION, aiGuard, audit, AuditAction } from '../shared';
import { sanitizePromptInput } from '../../../../../server/lib/promptSanitizer';

const analyzeSchema = z.object({
  prompt: z.string().min(1),
});

/**
 * POST /api/gemini/analyze — hardening vs the Express version:
 * - requires the `ai:use` permission (was: any authenticated user)
 * - client-supplied `systemInstruction` and `modelName` removed; the system
 *   instruction is server-owned so callers cannot override the assistant's
 *   operating constraints (prompt injection by design).
 * - the user prompt is sanitized before it reaches the model.
 */
export async function POST(req: NextRequest) {
  const guard = await aiGuard(req);
  if (guard instanceof NextResponse) return guard;
  try {
    const parsed = analyzeSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    const { prompt } = parsed.data;

    const response = await ai.models.generateContent({
      model: CHAT_MODEL,
      contents: sanitizePromptInput(prompt),
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    });

    await audit({ event: 'COPILOT_ANALYZE', actor: guard.user.name, role: guard.user.role, action: AuditAction.COPILOT_ANALYZE, details: `AI analyze request (model: ${CHAT_MODEL})` }).catch(() => {});
    return NextResponse.json({ success: true, text: response.text });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to query Gemini AI' }, { status: 500 });
  }
}
