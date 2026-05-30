// Email transports. A transport implements `send({ from, to, subject, html,
// text, replyTo })` and returns `{ id }`. The service depends only on this
// contract, so the provider can be swapped without touching template or
// service code.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Resend transport. Sends over the Resend HTTP API using the global fetch (no
// SDK dependency). Throws on a non-2xx response so callers can log/report it.
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

// Console transport. Used when no provider is configured (local dev / CI) so
// email-sending code paths stay exercised and observable without going online.
export function createConsoleTransport({ logger = console } = {}) {
  return {
    name: "console",
    async send({ from, to, subject }) {
      logger.info(`[email:console] to=${Array.isArray(to) ? to.join(",") : to} from=${from} subject="${subject}"`);
      return { id: `console-${Date.now()}` };
    }
  };
}
