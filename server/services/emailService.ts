import nodemailer from 'nodemailer';
import { getSettings } from './settingsService';
import { decrypt } from './encryptionService';

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResult {
  ok: boolean;
  error?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  try {
    const s = await getSettings([
      'smtp.host',
      'smtp.port',
      'smtp.security',
      'smtp.username',
      'smtp.password',
      'smtp.from_email',
      'smtp.from_name',
    ]);

    const host = s['smtp.host'];
    if (!host || !s['smtp.port']) {
      return { ok: false, error: 'SMTP not configured' };
    }

    let password = s['smtp.password'] || '';
    if (password && !password.includes('••••')) {
      try {
        password = decrypt(password);
      } catch {
        // keep stored value as-is
      }
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(s['smtp.port']),
      secure: s['smtp.security'] === 'ssl',
      auth: s['smtp.username']
        ? { user: s['smtp.username'], pass: password }
        : undefined,
    });

    const fromName = s['smtp.from_name'] || '4CoreFin Support';
    const fromEmail = s['smtp.from_email'] || s['smtp.username'];

    await transporter.sendMail({
      from: fromEmail ? `"${fromName}" <${fromEmail}>` : fromName,
      to: payload.to,
      subject: payload.subject,
      text: payload.text || '',
      html: payload.html,
    });

    return { ok: true };
  } catch (e: any) {
    console.error('[emailService] send failed:', e?.message || e);
    return { ok: false, error: e?.message || 'Unknown error' };
  }
}
