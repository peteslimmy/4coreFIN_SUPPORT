import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { GoogleGenAI, Type } from '@google/genai';
import { audit, AuditAction } from '../../../../server/auditEvents';
import type { AuthUser } from '../../../../server/compliance';
import { guardRequest } from '../../../../lib/server/apiContext';
import { rateLimit } from '../../../../lib/server/rateLimit';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
});

const CHAT_MODEL = 'gemini-3.5-flash';

const AI_MAX_PER_USER = 30;
const AI_BUDGET_WINDOW_MS = 15 * 60_000;
const aiUserUsage = new Map<string, { windowStart: number; count: number }>();

let lastSweep = 0;
function pruneAiUsage(): void {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [userId, entry] of aiUserUsage) {
    if (now - entry.windowStart >= AI_BUDGET_WINDOW_MS) aiUserUsage.delete(userId);
  }
}

/** Returns the remaining budget after consuming one unit, or null when exhausted. */
function takeAiBudget(userId: string): number | null {
  pruneAiUsage();
  const now = Date.now();
  const entry = aiUserUsage.get(userId);
  if (!entry || now - entry.windowStart >= AI_BUDGET_WINDOW_MS) {
    aiUserUsage.set(userId, { windowStart: now, count: 1 });
    return AI_MAX_PER_USER - 1;
  }
  if (entry.count >= AI_MAX_PER_USER) return null;
  entry.count += 1;
  return AI_MAX_PER_USER - entry.count;
}

/**
 * Shared AI guard: authentication + `ai:use` permission (previously any
 * authenticated user could reach the Gemini endpoints) + per-user budget.
 * System instructions are server-owned — client-supplied systemInstruction
 * was removed (audit fix: prompt-injection-by-design).
 */
export async function aiGuard(req: NextRequest): Promise<NextResponse | { user: AuthUser }> {
  const guard = await guardRequest(req, 'ai:use');
  if (guard instanceof NextResponse) return guard;
  const retryAfter = rateLimit(req, { windowMs: 15 * 60_000, max: 120, scope: 'ai' });
  if (retryAfter !== null) {
    return NextResponse.json(
      { success: false, error: 'Too many AI requests, please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }
  const remaining = takeAiBudget(guard.session.user.id);
  if (remaining === null) {
    return NextResponse.json(
      { success: false, error: `AI usage limit reached (${AI_MAX_PER_USER}/15 min). Please try again later.` },
      { status: 429 }
    );
  }
  return { user: guard.session.user };
}

export function safeParseAiJson(text: string | undefined): Record<string, unknown> {
  const raw = (text || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : { value: parsed };
  } catch {
    return { raw };
  }
}

export const chatSchema = z.object({
  message: z.string().min(1),
  history: z.array(z.object({ role: z.string(), text: z.string() })).optional().default([]),
});

export const SYSTEM_INSTRUCTION =
  'You are an elite, ISO 10002-compliant Lead Financial Support and Payment Operations Engineer at 4CoreFinSupport. You specialize in investigating payment incidents, transaction settlement latency, API timeouts, clearing network chargebacks, and gateway reconciliations across providers (Parkway, PayPal, Adyen, Braintree). Help internal teams and payment providers collaborate to resolve incidents quickly. Keep responses professional, highly precise, concise, and focused on payment operations.';

export { ai, CHAT_MODEL, Type, audit, AuditAction };
