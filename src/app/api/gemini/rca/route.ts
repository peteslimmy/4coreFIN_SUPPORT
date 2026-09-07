import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ai, Type, safeParseAiJson, aiGuard, audit, AuditAction } from '../shared';
import { sanitizePromptInput } from '../../../../../server/lib/promptSanitizer';

const rcaSchema = z.object({
  ticketDetails: z.object({
    id: z.string(),
    category: z.string(),
    issueType: z.string(),
    partner: z.string().optional(),
    provider: z.string().optional(),
    bu: z.string(),
    description: z.string(),
  }),
});

/**
 * POST /api/gemini/rca — hardening vs the Express version:
 * - requires `ai:use` permission
 * - ticketDetails interpolation is sanitized (was raw — a stored
 *   prompt-injection vector from any ticket description).
 */
export async function POST(req: NextRequest) {
  const guard = await aiGuard(req);
  if (guard instanceof NextResponse) return guard;
  try {
    const parsed = rcaSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    const td = parsed.data.ticketDetails;

    const contents = `Analyze this payment dispute complaint and generate structural Root Cause Analysis fields.
Ticket ID: ${sanitizePromptInput(td.id)}
Category: ${sanitizePromptInput(td.category)}
Sub-type: ${sanitizePromptInput(td.issueType)}
Payment Partner: ${sanitizePromptInput(td.partner || td.provider || '')}
Business Unit: ${sanitizePromptInput(td.bu)}
Description: ${sanitizePromptInput(td.description)}

Generate realistic and professional values for:
1. Root Cause Summary (detailed investigation of the failure vector)
2. Contributing Factors (such as network congestion, API timeout, etc.)
3. Corrective Actions (immediate mitigation steps performed)
4. Preventive Actions (long-term engineering/process safeguards)
5. Owner of Preventive Actions (appropriate department or role)
6. Due Date (YYYY-MM-DD format, roughly 14 days from today)`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rootCauseSummary: { type: Type.STRING },
            contributingFactors: { type: Type.STRING },
            correctiveActions: { type: Type.STRING },
            preventiveActions: { type: Type.STRING },
            preventiveOwner: { type: Type.STRING },
            preventiveDueDate: { type: Type.STRING },
          },
          required: [
            'rootCauseSummary',
            'contributingFactors',
            'correctiveActions',
            'preventiveActions',
            'preventiveOwner',
            'preventiveDueDate',
          ],
        },
      },
    });

    await audit({ event: 'COPILOT_RCA', actor: guard.user.name, role: guard.user.role, action: AuditAction.COPILOT_RCA, details: `AI RCA request for ticket ${td.id}` }).catch(() => {});
    return NextResponse.json({ success: true, data: safeParseAiJson(response.text) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to generate structured RCA' }, { status: 500 });
  }
}
