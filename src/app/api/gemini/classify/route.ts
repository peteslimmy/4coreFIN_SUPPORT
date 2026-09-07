import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ai, CHAT_MODEL, Type, safeParseAiJson, aiGuard, audit, AuditAction } from '../shared';
import { sanitizePromptInput } from '../../../../../server/lib/promptSanitizer';

const classifySchema = z.object({
  description: z.string().min(1),
  categories: z.any(),
});

/**
 * POST /api/gemini/classify — hardening vs the Express version:
 * - requires `ai:use` permission
 * - fabricated hardcoded "historical provider efficiency" statistics removed
 *   from the prompt (SEC-40); the assistant now maps category/priority from
 *   the caller-supplied category map and reasoning stays data-driven. Real
 *   partner scorecards should be injected once the scorecard service is
 *   queryable here (tracked follow-up).
 */
export async function POST(req: NextRequest) {
  const guard = await aiGuard(req);
  if (guard instanceof NextResponse) return guard;
  try {
    const parsed = classifySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    const { description, categories } = parsed.data;
    const categoriesJsonStr = JSON.stringify(categories, null, 2);

    const prompt = `You are an AI payment dispatch assistant. Classify the payment incident complaint description, map it to a category and sub-issue type from the available map, and pick the highest matching priority (CRITICAL, HIGH, MEDIUM, LOW) based on financial severity or customer friction.

INCIDENT DESCRIPTION:
"${sanitizePromptInput(description)}"

AVAILABLE CATEGORIES AND SUB-TYPES MAP:
${categoriesJsonStr}

Analyze the incident. Map it to one of the available Categories and one of its corresponding Sub-Issue Types. Provide a 1-2 sentence professional reasoning explanation of the classification.`;

    const response = await ai.models.generateContent({
      model: CHAT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            issueType: { type: Type.STRING },
            priority: { type: Type.STRING },
            reasoning: { type: Type.STRING },
          },
          required: ['category', 'issueType', 'priority', 'reasoning'],
        },
      },
    });

    await audit({ event: 'COPILOT_CLASSIFY', actor: guard.user.name, role: guard.user.role, action: AuditAction.COPILOT_CLASSIFY, details: `AI classify request for: ${description.slice(0, 80)}` }).catch(() => {});
    return NextResponse.json({ success: true, data: safeParseAiJson(response.text) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to classify ticket' }, { status: 500 });
  }
}
