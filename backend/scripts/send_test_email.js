/**
 * @file send_test_email.js
 * @description Developer utility that sends a single transactional email end-to-end
 * to verify the email pipeline (config → transport → Resend) and the localised
 * email templates. With `RESEND_API_KEY` set the script sends a real message via
 * Resend; without it the console transport logs the rendered email instead.
 *
 * Environment variables:
 *  - `TEST_EMAIL_TO`     (required) — recipient address.
 *  - `TEST_EMAIL_LOCALE` (optional) — locale source for template rendering.
 *    Accepts a native-language name or BCP-47-style code recognised by the email
 *    service (e.g. `English`, `Japanese`, `Chinese`, `ja`, `zh`). Default: `English`.
 *  - `TEST_EMAIL_TYPE`   (optional) — template to send. One of:
 *    `verification`, `passwordReset`, `receipt`, `dunning`. Default: `verification`.
 *
 * CLI usage:
 * ```
 * TEST_EMAIL_TO=you@example.com npm run email:test -w backend
 * ```
 *
 * External side effects: delivers a real email via Resend when `RESEND_API_KEY` is set.
 * Exits with code 1 if `TEST_EMAIL_TO` is not set or if the send fails.
 */
import { createEmailServiceFromConfig } from "../src/modules/email/index.js";
const to = String(process.env.TEST_EMAIL_TO || "").trim();
const nativeLanguage = process.env.TEST_EMAIL_LOCALE || "English";
const type = process.env.TEST_EMAIL_TYPE || "verification";

if (!to) {
  console.error("Set TEST_EMAIL_TO to the recipient address.");
  process.exit(1);
}

const emailService = createEmailServiceFromConfig();
const user = { email: to, nativeLanguage };

const senders = {
  verification: () => emailService.sendVerification(user, "test-verification-token"),
  passwordReset: () => emailService.sendPasswordReset(user, "test-reset-token"),
  receipt: () => emailService.sendReceipt(user, { planName: "Supergloss Pro", amount: "$5.00", periodEnd: "2026-12-31", invoiceUrl: "https://example.com/invoice" }),
  dunning: () => emailService.sendDunning(user, { amount: "$5.00", updatePaymentUrl: "https://example.com/billing" })
};

const send = senders[type];
if (!send) {
  console.error(`Unknown TEST_EMAIL_TYPE "${type}". Use: ${Object.keys(senders).join(", ")}.`);
  process.exit(1);
}

try {
  const result = await send();
  console.log(`Sent ${type} email to ${to} (locale source: ${nativeLanguage}). Message id: ${result.id || "(none)"}`);
} catch (error) {
  console.error(`Failed to send ${type} email: ${error.message}`);
  process.exit(1);
}
