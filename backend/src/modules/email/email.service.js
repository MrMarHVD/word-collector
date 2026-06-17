/**
 * @fileoverview Email service factory. Provider-agnostic transactional email
 * layer. Resolves the recipient's locale, renders the matching localized
 * template, and delegates delivery to the configured transport. All
 * product-facing email originates here so callers never interact with
 * templates or the transport directly.
 */

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
/**
 * Create an email service instance.
 *
 * @param {object} options
 * @param {{ send(msg: object): Promise<{ id: string|null }> }} options.transport
 *   Transport object with a `send` method (see `email.transport.js`).
 * @param {string} options.from - Default "From" address, e.g. `"App <noreply@example.com>"`.
 * @param {string} [options.replyTo=""] - Optional reply-to address.
 * @param {string} options.appUrl - Base URL used to build action links in emails.
 * @param {string} [options.brand="Supergloss"] - Product name used in email copy.
 * @param {object} [options.logger=console]
 * @returns {{ sendVerification, sendPasswordReset, sendReceipt, sendDunning }}
 * @throws {Error} When `transport` is not provided.
 */
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
    /**
     * Send an email-verification link to the user.
     * @param {{ email: string, nativeLanguage?: string }} user
     * @param {string} token - Raw verification token.
     * @returns {Promise<{ ok: true, id: string|null }>}
     */
    sendVerification(user, token) {
      return deliver(emailTemplates.verification, user, { actionUrl: actionUrl("verify_token", token) });
    },
    /**
     * Send a password-reset link to the user.
     * @param {{ email: string, nativeLanguage?: string }} user
     * @param {string} token - Raw reset token.
     * @returns {Promise<{ ok: true, id: string|null }>}
     */
    sendPasswordReset(user, token) {
      return deliver(emailTemplates.passwordReset, user, { actionUrl: actionUrl("reset_token", token) });
    },
    /**
     * Send a payment receipt to the user.
     * @param {{ email: string, nativeLanguage?: string }} user
     * @param {{ planName?: string, amount?: string, periodEnd?: string, invoiceUrl?: string }} [details]
     * @returns {Promise<{ ok: true, id: string|null }>}
     */
    sendReceipt(user, details = {}) {
      return deliver(emailTemplates.receipt, user, {
        planName: details.planName || "",
        amount: details.amount || "",
        periodEnd: details.periodEnd || "",
        actionUrl: details.invoiceUrl || ""
      });
    },
    /**
     * Send a failed-payment (dunning) notice to the user.
     * @param {{ email: string, nativeLanguage?: string }} user
     * @param {{ amount?: string, updatePaymentUrl?: string }} [details]
     * @returns {Promise<{ ok: true, id: string|null }>}
     */
    sendDunning(user, details = {}) {
      return deliver(emailTemplates.dunning, user, {
        amount: details.amount || "",
        actionUrl: details.updatePaymentUrl || ""
      });
    }
  };
}
