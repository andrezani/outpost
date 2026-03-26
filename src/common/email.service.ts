import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY not set — transactional emails will be skipped');
      this.resend = null;
    } else {
      this.resend = new Resend(apiKey);
    }
    this.from = this.config.get<string>('EMAIL_FROM') ?? 'Outpost <hello@outpost.dev>';
  }

  async sendWaitlistConfirmation(email: string): Promise<void> {
    if (!this.resend) return;

    const text = `Hey,

You're on the Outpost waitlist. We're building the API-first social publishing layer for AI agents — no dashboards, no OAuth dance, just POST your content and let Outpost handle the rest.

When your spot opens up, you'll get an API key and be posting in under 5 minutes.

Founding rate is live: 50 seats at $49/mo for Team (normally $99). First come, first served.

Anything you're building? Hit reply — I read everything.

— Andrea, Outpost

outpost.dev`;

    const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111;line-height:1.6">
  <p>Hey,</p>
  <p>You're on the Outpost waitlist. We're building the API-first social publishing layer for AI agents — no dashboards, no OAuth dance, just POST your content and let Outpost handle the rest.</p>
  <p>When your spot opens up, you'll get an API key and be posting in under 5 minutes.</p>
  <p><strong>Founding rate is live:</strong> 50 seats at $49/mo for Team (normally $99). First come, first served.</p>
  <p>Anything you're building? Hit reply — I read everything.</p>
  <p>— Andrea, Outpost</p>
  <p style="color:#888;font-size:13px">outpost.dev</p>
</div>`;

    try {
      await this.resend.emails.send({
        from: this.from,
        to: email,
        subject: "You're on the Outpost waitlist ✅",
        text,
        html,
      });
    } catch (err: unknown) {
      this.logger.error('Failed to send waitlist confirmation email', err);
    }
  }

  async sendApiKeyWelcome(email: string, apiKey: string, orgId: string): Promise<void> {
    if (!this.resend) return;

    const curlExample =
      `curl -X POST https://api.outpost.dev/api/v1/publish \\\n` +
      `  -H "X-API-Key: ${apiKey}" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '{"content": "Hello from Outpost 🚀", "platforms": ["twitter"]}'`;

    const text = `Your API key is ready.

API Key: ${apiKey}
Org ID:  ${orgId}

Quick start (30 seconds):

${curlExample}

Free tier: 100 posts/month, 3 platforms.
Docs: https://outpost.dev/docs/quickstart

— Andrea, Outpost`;

    const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111;line-height:1.6">
  <p>Your API key is ready.</p>
  <table style="border-collapse:collapse;margin-bottom:16px">
    <tr><td style="padding:4px 12px 4px 0;color:#555">API Key</td><td style="font-family:monospace;font-size:13px">${apiKey}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#555">Org ID</td><td style="font-family:monospace;font-size:13px">${orgId}</td></tr>
  </table>
  <p><strong>Quick start (30 seconds):</strong></p>
  <pre style="background:#f5f5f5;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto">${curlExample}</pre>
  <p>Free tier: 100 posts/month, 3 platforms.<br>Docs: <a href="https://outpost.dev/docs/quickstart">https://outpost.dev/docs/quickstart</a></p>
  <p>— Andrea, Outpost</p>
</div>`;

    try {
      await this.resend.emails.send({
        from: this.from,
        to: email,
        subject: 'Your Outpost API key is ready 🚀',
        text,
        html,
      });
    } catch (err: unknown) {
      this.logger.error('Failed to send API key welcome email', err);
    }
  }
}
