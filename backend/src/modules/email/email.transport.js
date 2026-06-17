/**
 * @fileoverview Email transports. Each transport implements the contract
 * `send({ from, to, subject, html, text, replyTo }) → Promise<{ id }>`.
 * The email service depends only on this interface, so the provider can be
 * swapped without modifying template or service code.
 *
 * Available transports:
 * - {@link createResendTransport} — Resend HTTP API (no SDK dependency).
 * - {@link createBrevoTransport} — Brevo SMTP via nodemailer.
 * - {@link createConsoleTransport} — Console logger for local dev/CI.
 */

// Email transports. A transport implements `send({ from, to, subject, html,
// text, replyTo })` and returns `{ id }`. The service depends only on this
// contract, so the provider can be swapped without touching template or
// service code.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Create a Resend transport. Uses the global `fetch` (no SDK required).
 * @param {{ apiKey: string, fetchImpl?: typeof fetch }} options
 * @returns {{ name: "resend", send: function }}
 * @throws {Error} On a non-2xx API response.
 */
export function createResendTransport({ apiKey, fetchImpl = fetch }) {
  return {
    name: "resend",
    async send({ from, to, subject, html, text, replyTo }) {
      const response = await fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          from,
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
          text,
          ...(replyTo ? { reply_to: replyTo } : {})
        })
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        const detail = payload?.message || payload?.error || `HTTP ${response.status}`;
        throw new Error(`Resend send failed: ${detail}`);
      }
      return { id: payload?.id || null };
    }
  };
}

/**
 * Create a Brevo SMTP transport backed by nodemailer (dynamically imported).
 * @param {{ host: string, port: number, user: string, pass: string }} options
 * @returns {{ name: "brevo", send: function }}
 */
export function createBrevoTransport({ host, port, user, pass }) {
  return {
    name: "brevo",
    async send({ from, to, subject, html, text, replyTo }) {
      const { createTransport } = await import("nodemailer");
      const transporter = createTransport({
        host,
        port,
        auth: { user, pass }
      });
      const result = await transporter.sendMail({
        from,
        to: Array.isArray(to) ? to.join(", ") : to,
        subject,
        html,
        text,
        ...(replyTo ? { replyTo } : {})
      });
      return { id: result.messageId || null };
    }
  };
}

/**
 * Create a console transport. Logs the email destination and subject instead
 * of sending; used when no real provider is configured (local dev / CI).
 * @param {{ logger?: object }} [options]
 * @returns {{ name: "console", send: function }}
 */
export function createConsoleTransport({ logger = console } = {}) {
  return {
    name: "console",
    async send({ from, to, subject }) {
      logger.info(`[email:console] to=${Array.isArray(to) ? to.join(",") : to} from=${from} subject="${subject}"`);
      return { id: `console-${Date.now()}` };
    }
  };
}
