// Morse Messenger — email delivery (verification links).
// Providers, tried in order:
//   1. Resend HTTP API   — RESEND_API_KEY                       (no dependency)
//   2. any SMTP server   — SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS (nodemailer;
//                          works great with a Gmail app password)
//   3. none configured   — the link is logged server-side and signup still works

import type { Transporter } from 'nodemailer'

export type EmailResult = 'sent' | 'skipped' | 'failed'

export function emailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY ||
      (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  )
}

function verificationEmailHtml(link: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#0A1224;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#101B33;border:1px solid #1E2C4F;border-radius:16px;padding:32px;">
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;color:#22D3EE;">&#183; &#8722;&#8722; &#183; &#183; &#183;&#8722; &#183; &#183;&#183;&#183; &#183;&#183; &#8722;&#8722; &#183; &#183;&#8722;&#183;&#183; &#183;&#8722;&#183;&#8722;</p>
    <h1 style="margin:0 0 16px;font-size:20px;color:#E7EEFB;">Verify your email</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#8CA3C7;">
      Welcome to <strong style="color:#E7EEFB;">Morse Messenger</strong>. Confirm this address to secure your account
      &mdash; tap the button below (valid for 24 hours).
    </p>
    <a href="${link}" style="display:inline-block;background:#22D3EE;color:#0A1224;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:12px;">
      Verify email
    </a>
    <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8CA3C7;word-break:break-all;">
      Or paste this link into your browser:<br/>${link}
    </p>
    <p style="margin:24px 0 0;font-size:11px;color:#8CA3C7;">
      Didn&#8217;t sign up? You can safely ignore this email.
    </p>
  </div>
</body></html>`
}

async function sendViaResend(to: string, subject: string, html: string, text: string): Promise<EmailResult> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Morse Messenger <onboarding@resend.dev>',
      to,
      subject,
      html,
      text,
    }),
  })
  if (!res.ok) {
    console.warn(`[email] resend rejected: ${res.status} ${await res.text().catch(() => '')}`)
    return 'failed'
  }
  return 'sent'
}

async function sendViaSmtp(to: string, subject: string, html: string, text: string): Promise<EmailResult> {
  const port = Number(process.env.SMTP_PORT || 587)
  const nodemailer = await import('nodemailer')
  const transport: Transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER as string, pass: process.env.SMTP_PASS as string },
  })
  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM || `Morse Messenger <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text,
    })
    return 'sent'
  } finally {
    transport.close()
  }
}

/** Send the verification email. Never throws — signup must not depend on mail. */
export async function sendVerificationEmail(to: string, link: string): Promise<EmailResult> {
  const subject = 'Verify your email — Morse Messenger'
  const html = verificationEmailHtml(link)
  const text = `Verify your email for Morse Messenger: ${link}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this email.`
  try {
    if (process.env.RESEND_API_KEY) return await sendViaResend(to, subject, html, text)
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      return await sendViaSmtp(to, subject, html, text)
    }
    console.log(`[email] no provider configured — verification link for ${to}: ${link}`)
    return 'skipped'
  } catch (err) {
    console.warn('[email] send failed:', err)
    return 'failed'
  }
}
