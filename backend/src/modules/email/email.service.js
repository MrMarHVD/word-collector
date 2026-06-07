import { resolveEmailLocale } from "./email.locale.js";
import { emailTemplates } from "./email.templates.js";

// Provider-agnostic transactional email service. Resolves the recipient's
// locale from their native language, renders the matching localized template,
// and hands the result to the configured transport. All product-facing email
// originates here so callers never touch templates or the provider directly.
//
// Options:
//   transport   — object with `send({ from, to, subject, html, text, replyTo })`
//   from        — default "From" address (e.g. "Supergloss <noreply@example.com>")
//   replyTo     — optional reply-to address
//   appUrl      — base URL used to build action links
//   brand       — product name shown in copy (default "Supergloss")
//   logger      — defaults to console
export function createEmailService({ transport, from, replyTo = "", appUrl, brand = "Supergloss", logger = console }) {
  if (!transport) {
    throw new Error("createEmailService requires a transport.");
  }

  // The frontend SPA has no server-side path fallback, so action links land on
  // the app root and carry their token as a query parameter the bootstrap reads.
  function actionUrl(param, token) {
    const base = String(appUrl || "").replace(/\/+$/, "");
    return `${base}/?${param}=${encodeURIComponent(token)}`;
  }

  async function deliver(template, user, params) {
    const locale = resolveEmailLocale(user?.nativeLanguage);
    const { subject, html, text } = template(locale, { brand, ...params });
    try {
      const result = await transport.send({ from, to: user.email, subject, html, text, replyTo });
      return { ok: true, id: result?.id || null };
    } catch (error) {
      logger.error(`Email send failed (to=${user?.email}, subject="${subject}"): ${error.message}`);
      throw error;
    }
  }

  return {
    sendVerification(user, token) {
      return deliver(emailTemplates.verification, user, { actionUrl: actionUrl("verify_token", token) });
    },
    sendPasswordReset(user, token) {
      return deliver(emailTemplates.passwordReset, user, { actionUrl: actionUrl("reset_token", token) });
    },
    // details: { planName, amount, periodEnd, invoiceUrl }
    sendReceipt(user, details = {}) {
      return deliver(emailTemplates.receipt, user, {
        planName: details.planName || "",
        amount: details.amount || "",
        periodEnd: details.periodEnd || "",
        actionUrl: details.invoiceUrl || ""
      });
    },
    // details: { amount, updatePaymentUrl }
    sendDunning(user, details = {}) {
      return deliver(emailTemplates.dunning, user, {
        amount: details.amount || "",
        actionUrl: details.updatePaymentUrl || ""
      });
    }
  };
}
