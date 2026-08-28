import { Router, type Response } from 'express';
import { z } from 'zod';
import { GoogleGenAI, Type } from '@google/genai';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { requireAuth, type AuthedRequest } from '../auth';
import { audit, AuditAction } from '../auditEvents';
import { sanitizePromptInput } from '../lib/promptSanitizer';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
});

const ALLOWED_MODELS = new Set(['gemini-3.5-flash', 'gemini-3.1-pro-preview']);
const validModel = (m: unknown): string | null =>
  typeof m === 'string' && ALLOWED_MODELS.has(m) ? m : null;

// ── Rate limiting + budget ──────────────────────────────────────────────

const AI_BUDGET_WINDOW_MS = 15 * 60 * 1000;
const AI_MAX_PER_USER = 30;
const aiUserUsage = new Map<string, { windowStart: number; count: number }>();

/** Periodically sweep expired windows so the map stays bounded. Runs at most
 *  once per sweep interval; O(n) over a small per-user map. */
let lastUsageSweep = 0;
function pruneAiUsage(): void {
  const now = Date.now();
  if (now - lastUsageSweep < 60_000) return;
  lastUsageSweep = now;
  for (const [userId, entry] of aiUserUsage) {
    if (now - entry.windowStart >= AI_BUDGET_WINDOW_MS) aiUserUsage.delete(userId);
  }
}

function takeAiBudget(userId: string): boolean {
  pruneAiUsage();
  const now = Date.now();
  const entry = aiUserUsage.get(userId);
  if (!entry || now - entry.windowStart >= AI_BUDGET_WINDOW_MS) {
    aiUserUsage.set(userId, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= AI_MAX_PER_USER) return false;
  entry.count += 1;
  return true;
}

const aiIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests, please try again later.' },
  keyGenerator: ipKeyGenerator,
});

/**
 * Parse AI response text defensively. Models occasionally wrap the JSON
 * payload in prose or truncate mid-object; surfacing the raw text beats a
 * SyntaxError-driven 500 with no usable data.
 */
function safeParseAiJson(text: string | undefined): Record<string, unknown> {
  const raw = (text || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : { value: parsed };
  } catch {
    return { raw };
  }
}

const aiBudgetGuard = (req: AuthedRequest, res: any, next: any) => {
  if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
  if (!takeAiBudget(req.user.id)) {
    return res.status(429).json({ error: `AI usage limit reached (${AI_MAX_PER_USER}/15 min). Please try again later.` });
  }
  next();
};

// ── Schemas ─────────────────────────────────────────────────────────────

const analyzeSchema = z.object({
  prompt: z.string().min(1),
  systemInstruction: z.string().optional(),
  modelName: z.string().optional(),
});

const classifySchema = z.object({
  description: z.string().min(1),
  categories: z.any(),
});

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

const chatSchema = z.object({
  message: z.string().min(1),
  history: z.array(z.object({ role: z.string(), text: z.string() })).optional().default([]),
});

// ── Router ──────────────────────────────────────────────────────────────

export function createCopilotRouter(): Router {
  const router = Router();

  // POST /api/gemini/analyze
  router.post('/gemini/analyze', requireAuth, aiIpLimiter, aiBudgetGuard, async (req: AuthedRequest, res: Response) => {
    try {
      const parsed = analyzeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid request body' });
      const { prompt, systemInstruction, modelName } = parsed.data;
      const model = validModel(modelName) || 'gemini-3.5-flash';

      const response = await ai.models.generateContent({
        model,
        contents: sanitizePromptInput(prompt),
        config: systemInstruction ? { systemInstruction } : undefined,
      });

      await audit({
        event: 'COPILOT_ANALYZE',
        actor: req.user!.name,
        role: req.user!.role,
        action: AuditAction.COPILOT_ANALYZE,
        details: `AI analyze request (model: ${model})`,
      });

      res.json({ success: true, text: response.text });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to query Gemini AI' });
    }
  });

  // POST /api/gemini/classify
  router.post('/gemini/classify', requireAuth, aiIpLimiter, aiBudgetGuard, async (req: AuthedRequest, res: Response) => {
    try {
      const parsed = classifySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid request body' });
      const { description, categories } = parsed.data;
      const categoriesJsonStr = JSON.stringify(categories, null, 2);

      const prompt = `You are an AI payment dispatch bot. Your job is to classify the payment incident complaint description, map it to a category and sub-issue type, and recommend the best provider based on historical resolution efficiency.

INCIDENT DESCRIPTION:
"${description}"

AVAILABLE CATEGORIES AND SUB-TYPES MAP:
${categoriesJsonStr}

HISTORICAL PROVIDER EFFICIENCY RULES (Based on historical resolution speed and success rate):
1. **Parkway**: Highest efficiency (98% success, MTTR: 1.5 hours) for "Duplicate Debit" and "Reversal Error". Slow for terminal issues.
2. **Adyen**: Best for high-value "Settlement Delay" and cross-border settlement (92% success, MTTR: 4.0 hours).
3. **PayPal**: Premium support for hardware terminal issues ("Merchant Issue", "POS Terminal Timeout") (94% success, MTTR: 1.8 hours).
4. **Braintree**: Versatile support for general payment gateways, custom APIs, and callback notifications (89% success, MTTR: 3.0 hours).

Analyze the incident. Map it to one of the available Categories and one of its corresponding Sub-Issue Types. Pick the highest matching priority (CRITICAL, HIGH, MEDIUM, LOW) based on the financial severity or customer friction. Pick the best provider based on historical provider efficiency rules. Provide a 1-2 sentence professional reasoning explanation of why you classified it this way and recommended that provider.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: sanitizePromptInput(prompt),
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              issueType: { type: Type.STRING },
              priority: { type: Type.STRING },
              provider: { type: Type.STRING },
              reasoning: { type: Type.STRING },
            },
            required: ['category', 'issueType', 'priority', 'provider', 'reasoning'],
          },
        },
      });

      await audit({
        event: 'COPILOT_CLASSIFY',
        actor: req.user!.name,
        role: req.user!.role,
        action: AuditAction.COPILOT_CLASSIFY,
        details: `AI classify request for: ${description.slice(0, 80)}`,
      });

      res.json({ success: true, data: safeParseAiJson(response.text) });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to classify ticket' });
    }
  });

  // POST /api/gemini/rca
  router.post('/gemini/rca', requireAuth, aiIpLimiter, aiBudgetGuard, async (req: AuthedRequest, res: Response) => {
    try {
      const parsed = rcaSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid request body' });
      const { ticketDetails } = parsed.data;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: `Analyze this payment dispute complaint and generate structural Root Cause Analysis fields.
Ticket ID: ${ticketDetails.id}
Category: ${ticketDetails.category}
Sub-type: ${ticketDetails.issueType}
Payment Partner: ${ticketDetails.partner || ticketDetails.provider}
Business Unit: ${ticketDetails.bu}
Description: ${ticketDetails.description}

Generate realistic and professional values for:
1. Root Cause Summary (detailed investigation of the failure vector)
2. Contributing Factors (such as network congestion, API timeout, etc.)
3. Corrective Actions (immediate mitigation steps performed)
4. Preventive Actions (long-term engineering/process safeguards)
5. Owner of Preventive Actions (appropriate department or role)
6. Due Date (YYYY-MM-DD format, roughly 14 days from today)`,
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

      await audit({
        event: 'COPILOT_RCA',
        actor: req.user!.name,
        role: req.user!.role,
        action: AuditAction.COPILOT_RCA,
        details: `AI RCA request for ticket ${ticketDetails.id}`,
      });

      res.json({ success: true, data: safeParseAiJson(response.text) });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to generate structured RCA' });
    }
  });

  // POST /api/gemini/chat
  router.post('/gemini/chat', requireAuth, aiIpLimiter, aiBudgetGuard, async (req: AuthedRequest, res: Response) => {
    try {
      const parsed = chatSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid request body' });
      const { message, history } = parsed.data;

      let chatPrompt = '';
      if (history && history.length > 0) {
        history.forEach((h) => {
          chatPrompt += `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}\n`;
        });
      }
      chatPrompt += `User: ${sanitizePromptInput(message)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: chatPrompt,
        config: {
          systemInstruction:
            'You are an elite, ISO 10002-compliant Lead Financial Support and Payment Operations Engineer at 4CoreFinSupport. You specialize in investigating payment incidents, transaction settlement latency, API timeouts, clearing network chargebacks, and gateway reconciliations across providers (Parkway, PayPal, Adyen, Braintree). Help internal teams and payment providers collaborate to resolve incidents quickly. Keep responses professional, highly precise, concise, and focused on payment operations.',
        },
      });

      await audit({
        event: 'COPILOT_CHAT',
        actor: req.user!.name,
        role: req.user!.role,
        action: AuditAction.COPILOT_CHAT,
        details: `AI chat message`,
      });

      res.json({ success: true, text: response.text });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to get chatbot response' });
    }
  });

  return router;
}
