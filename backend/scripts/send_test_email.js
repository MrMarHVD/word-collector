import { createEmailServiceFromConfig } from "../src/modules/email/index.js";

// Sends a single transactional email end-to-end to verify the email pipeline
// (config -> transport -> Resend) and localized templates. With RESEND_API_KEY
// set it sends a real message; otherwise the console transport just logs it.
//
// Usage:
//   TEST_EMAIL_TO=you@example.com npm run email:test -w backend
// Optional:
//   TEST_EMAIL_LOCALE=ja|zh|English|Japanese|Chinese   (default: English)
//   TEST_EMAIL_TYPE=verification|passwordReset|receipt|dunning (default: verification)
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
