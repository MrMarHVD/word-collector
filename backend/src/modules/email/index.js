import { APP_URL, BREVO_SMTP_HOST, BREVO_SMTP_PASS, BREVO_SMTP_PORT, BREVO_SMTP_USER, EMAIL_FROM, EMAIL_REPLY_TO, RESEND_API_KEY } from "../../config.js";
import { createEmailService } from "./email.service.js";
import { createBrevoTransport, createConsoleTransport, createResendTransport } from "./email.transport.js";

export { createEmailService } from "./email.service.js";
export { createBrevoTransport, createConsoleTransport, createResendTransport } from "./email.transport.js";

// Build the email service from runtime config. Resend takes priority, then
// Brevo SMTP, then console fallback for dev/CI.
export function createEmailServiceFromConfig({ logger = console } = {}) {
  let transport;
  if (RESEND_API_KEY) {
    transport = createResendTransport({ apiKey: RESEND_API_KEY });
  } else if (BREVO_SMTP_HOST && BREVO_SMTP_USER && BREVO_SMTP_PASS) {
    transport = createBrevoTransport({ host: BREVO_SMTP_HOST, port: BREVO_SMTP_PORT, user: BREVO_SMTP_USER, pass: BREVO_SMTP_PASS });
  } else {
    transport = createConsoleTransport({ logger });
    logger.warn("No email provider configured; emails are logged to the console instead of being sent.");
  }
  return createEmailService({
    transport,
    from: EMAIL_FROM,
    replyTo: EMAIL_REPLY_TO,
    appUrl: APP_URL,
    logger
  });
}
