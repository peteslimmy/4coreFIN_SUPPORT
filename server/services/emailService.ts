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

export interface InvitePayload {
  to: string;
  name: string;
  email: string;
  loginUrl: string;
  tempPassword: string;
  sentBy?: string;
}

/** Escape HTML in a plain value used inside email templates. */
function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}

const INVITE_TEMPLATE = (o: {
  name: string;
  loginUrl: string;
  email: string;
  tempPassword: string;
  fromName: string;
}) => `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:24px 28px;">
              <div style="color:#ffffff;font-size:20px;font-weight:bold;">${esc(o.fromName)}</div>
              <div style="color:#bfdbfe;font-size:13px;margin-top:4px;">Payment Operations Support</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 8px;font-size:18px;color:#0f172a;">Welcome, ${esc(o.name)}</h1>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
                An administrator has created an account for you. Sign in with the temporary credentials below,
                then you will be asked to set a password of your own.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:20px;">
                <tr>
                  <td style="padding:14px 16px;font-size:13px;color:#475569;">
                    <div style="color:#64748b;font-size:12px;margin-bottom:2px;">Sign-in email</div>
                    <div style="font-weight:bold;color:#0f172a;">${esc(o.email)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">
                    <div style="color:#64748b;font-size:12px;margin-bottom:2px;">Temporary password</div>
                    <div style="font-weight:bold;font-family:monospace;color:#0f172a;letter-spacing:1px;">${esc(o.tempPassword)}</div>
                  </td>
                </tr>
              </table>
              <a href="${esc(o.loginUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:8px;padding:12px 24px;font-size:14px;">
                Sign in now
              </a>
              <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#64748b;">
                For security, this temporary password expires once you set your own password. If you
                did not expect this invitation, please ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
              4CoreFinSupport — Incident Control &amp; Payment Operations
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const INVITE_TEXT = (o: {
  name: string;
  loginUrl: string;
  email: string;
  tempPassword: string;
}) =>
  `Welcome, ${o.name}!\n\nAn administrator created your 4CoreFinSupport account.\n\nSign-in email: ${o.email}\nTemporary password: ${o.tempPassword}\n\nSign in here: ${o.loginUrl}\n\nYou will be asked to set a password of your own on first login.\n\nIf you did not expect this invitation, please ignore this email.`;

/**
 * Send the "welcome / temporary credentials" invitation email for a newly
 * provisioned account. Returns false when SMTP is not configured so callers can
 * surface a soft warning in the UI rather than failing the user creation.
 */
export async function sendUserInvite(payload: InvitePayload): Promise<EmailResult> {
  try {
    const s = await getSettings(['branding.org_name', 'smtp.from_name']);
    const fromName = s['smtp.from_name'] || '4CoreFin Support';
    const orgName = s['branding.org_name'] || '4CoreFin';

    const html = INVITE_TEMPLATE({
      name: payload.name,
      loginUrl: payload.loginUrl,
      email: payload.email,
      tempPassword: payload.tempPassword,
      fromName: `${orgName} ${fromName}`.trim(),
    });
    const text = INVITE_TEXT({
      name: payload.name,
      loginUrl: payload.loginUrl,
      email: payload.email,
      tempPassword: payload.tempPassword,
    });

    return sendEmail({
      to: payload.to,
      subject: `Your ${orgName} Support account has been created`,
      html,
      text,
    });
  } catch (e: any) {
    console.error('[emailService] invite send failed:', e?.message || e);
    return { ok: false, error: e?.message || 'Unknown error' };
  }
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
