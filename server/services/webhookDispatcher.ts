import { supabase } from '../supabase';

export type WebhookEvent =
  | 'ticket.created'
  | 'ticket.updated'
  | 'ticket.transitioned'
  | 'ticket.deleted'
  | 'ticket.escalated'
  | 'sla.breach'
  | 'sla.at_risk';

const DELIVER_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [2000, 8000, 30000];

async function postWithTimeout(url: string, body: string, headers: Record<string, string>, timeoutMs: number): Promise<{ ok: boolean; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function signPayload(secret: string, payload: string): Promise<string> {
  const data = new TextEncoder().encode(payload);
  const key = new TextEncoder().encode(secret);
  const algo = { name: 'HMAC', hash: 'SHA-256' };
  const cryptoKey = await crypto.subtle.importKey('raw', key, algo, false, ['sign']);
  const rawSig = await crypto.subtle.sign('HMAC', cryptoKey, data);
  return Buffer.from(rawSig).toString('hex');
}

export async function registerDeliveryAttempt(params: {
  webhookId: string;
  eventType: WebhookEvent;
  payload: unknown;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
}): Promise<void> {
  await supabase.from('webhook_deliveries').insert({
    webhook_id: params.webhookId,
    event_type: params.eventType,
    response_status: params.responseStatus,
    response_body: params.responseBody,
    error: params.error,
    delivered_at: new Date().toISOString(),
  });
}

export async function dispatchWebhook(eventType: WebhookEvent, payload: unknown): Promise<void> {
  let active: any[] = [];
  try {
    const { data } = await supabase.from('webhooks').select('*').eq('is_active', true);
    active = (data ?? []).filter((w: any) => (w.events || []).includes(eventType));
  } catch {
    return;
  }
  if (!active.length) return;

  const body = JSON.stringify({ event: eventType, timestamp: new Date().toISOString(), payload });
  const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json', 'X-Webhook-Event': eventType };

  for (const webhook of active) {
    const headers: Record<string, string> = { ...baseHeaders };
    const secret = webhook.secret || '';
    if (secret) {
      headers['X-Webhook-Signature-256'] = 'sha256=' + await signPayload(secret, body);
    } else {
      delete headers['X-Webhook-Signature-256'];
    }

    let last: { ok: boolean; status: number } = { ok: false, status: 0 };
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
      last = await postWithTimeout(webhook.url, body, headers, DELIVER_TIMEOUT_MS);
      if (last.ok) {
        await supabase.from('webhooks').update({ last_fired_at: new Date().toISOString() }).eq('id', webhook.id);
        break;
      }
    }

    await registerDeliveryAttempt({
      webhookId: webhook.id,
      eventType,
      payload,
      responseStatus: last.status,
      responseBody: last.ok ? 'OK' : 'FAIL',
      error: last.ok ? undefined : `All ${MAX_RETRIES + 1} attempts failed`,
    });

    if (!last.ok) {
      console.error(`[webhook] delivery failed for ${webhook.id} (${webhook.url}) after ${MAX_RETRIES + 1} attempts`);
    }
  }
}