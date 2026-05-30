import { APP_URL, EMAIL_FROM, EMAIL_REPLY_TO, RESEND_API_KEY } from "../../config.js";
import { createEmailService } from "./email.service.js";
import { createConsoleTransport, createResendTransport } from "./email.transport.js";

export { createEmailService } from "./email.service.js";
export { createConsoleTransport, createResendTransport } from "./email.transport.js";

// Build the email service from runtime config. Uses the Resend transport when
// RESEND_API_KEY is set, otherwise a console transport so dev/CI stay offline.
export function createEmailServiceFromConfig({ logger = console } = {}) {
  const transport = RESEND_API_KEY
    ? createResendTransport({ apiKey: RESEND_API_KEY })
    : createConsoleTransport({ logger });
  if (!RESEND_API_KEY) {
    logger.warn("RESEND_API_KEY is not set; emails are logged to the console instead of being sent.");
  }
  return createEmailService({
    transport,
    from: EMAIL_FROM,
    replyTo: EMAIL_REPLY_TO,
    appUrl: APP_URL,
    logger
  });
}
