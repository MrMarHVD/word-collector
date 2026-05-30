import { DEFAULT_EMAIL_LOCALE } from "./email.locale.js";

// Localized transactional email templates. Each template builder returns
// { subject, html, text } for a given locale and set of parameters. Keep the
// HTML simple and inline-styled so it renders across email clients.

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Shared HTML shell shared by every email so branding and styling stay consistent.
function layout({ brand, heading, paragraphs, buttonLabel, buttonUrl, footer }) {
  const safeBrand = escapeHtml(brand);
  const body = paragraphs.map((line) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2933;">${line}</p>`).join("");
  const button = buttonLabel && buttonUrl
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;padding:12px 22px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">${escapeHtml(buttonLabel)}</a></p>`
    : "";
  const fallbackLink = buttonUrl
    ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#52606d;word-break:break-all;">${escapeHtml(buttonUrl)}</p>`
    : "";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f7fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e4e7eb;">
      <tr><td style="padding:28px 32px;">
        <p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#2563eb;">${safeBrand}</p>
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.4;color:#0b1220;">${escapeHtml(heading)}</h1>
        ${body}
        ${button}
        ${fallbackLink}
        <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e4e7eb;font-size:12px;line-height:1.6;color:#7b8794;">${escapeHtml(footer)}</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

function textBody({ heading, lines, buttonLabel, buttonUrl, footer }) {
  const parts = [heading, "", ...lines];
  if (buttonLabel && buttonUrl) {
    parts.push("", `${buttonLabel}: ${buttonUrl}`);
  }
  parts.push("", footer);
  return parts.join("\n");
}

// Per-locale copy. Values may be functions of the template parameters.
const STRINGS = {
  en: {
    verification: {
      subject: (p) => `Confirm your ${p.brand} email`,
      heading: "Confirm your email address",
      paragraphs: () => [
        "Thanks for signing up. Please confirm your email address to activate your account.",
        "This link expires in 24 hours."
      ],
      button: "Confirm email",
      footer: "If you didn't create this account, you can safely ignore this email."
    },
    passwordReset: {
      subject: (p) => `Reset your ${p.brand} password`,
      heading: "Reset your password",
      paragraphs: () => [
        "We received a request to reset your password. Use the button below to choose a new one.",
        "This link expires in 1 hour."
      ],
      button: "Reset password",
      footer: "If you didn't request a password reset, you can safely ignore this email."
    },
    receipt: {
      subject: (p) => `Your ${p.brand} receipt`,
      heading: "Payment received",
      paragraphs: (p) => [
        `Thank you for subscribing to ${escapeHtml(p.planName)}.`,
        `Amount charged: ${escapeHtml(p.amount)}.`,
        p.periodEnd ? `Your subscription is active until ${escapeHtml(p.periodEnd)}.` : ""
      ].filter(Boolean),
      button: "View invoice",
      footer: "This is an automated receipt for your records."
    },
    dunning: {
      subject: (p) => `Action needed: payment failed for ${p.brand}`,
      heading: "Your payment didn't go through",
      paragraphs: (p) => [
        `We couldn't process your payment of ${escapeHtml(p.amount)}.`,
        "Please update your payment details to keep your subscription active."
      ],
      button: "Update payment method",
      footer: "If your payment isn't updated, your subscription may be canceled."
    }
  },
  ja: {
    verification: {
      subject: (p) => `${p.brand} のメールアドレスを確認してください`,
      heading: "メールアドレスの確認",
      paragraphs: () => [
        "ご登録ありがとうございます。アカウントを有効にするため、メールアドレスを確認してください。",
        "このリンクの有効期限は24時間です。"
      ],
      button: "メールアドレスを確認",
      footer: "このアカウントに心当たりがない場合は、このメールを無視してください。"
    },
    passwordReset: {
      subject: (p) => `${p.brand} のパスワードを再設定してください`,
      heading: "パスワードの再設定",
      paragraphs: () => [
        "パスワード再設定のリクエストを受け付けました。下のボタンから新しいパスワードを設定してください。",
        "このリンクの有効期限は1時間です。"
      ],
      button: "パスワードを再設定",
      footer: "パスワード再設定をリクエストしていない場合は、このメールを無視してください。"
    },
    receipt: {
      subject: (p) => `${p.brand} のお支払い明細`,
      heading: "お支払いを受け付けました",
      paragraphs: (p) => [
        `${escapeHtml(p.planName)} へのご登録ありがとうございます。`,
        `請求金額: ${escapeHtml(p.amount)}`,
        p.periodEnd ? `ご利用期間は ${escapeHtml(p.periodEnd)} までです。` : ""
      ].filter(Boolean),
      button: "請求書を表示",
      footer: "これは記録用の自動送信明細です。"
    },
    dunning: {
      subject: (p) => `お手続きのお願い: ${p.brand} のお支払いに失敗しました`,
      heading: "お支払いを処理できませんでした",
      paragraphs: (p) => [
        `${escapeHtml(p.amount)} のお支払いを処理できませんでした。`,
        "サブスクリプションを継続するため、お支払い情報を更新してください。"
      ],
      button: "お支払い方法を更新",
      footer: "お支払い情報が更新されない場合、サブスクリプションが解約されることがあります。"
    }
  },
  zh: {
    verification: {
      subject: (p) => `请确认您的 ${p.brand} 邮箱`,
      heading: "确认您的邮箱地址",
      paragraphs: () => [
        "感谢您的注册。请确认您的邮箱地址以激活账户。",
        "此链接将在 24 小时后失效。"
      ],
      button: "确认邮箱",
      footer: "如果您没有创建此账户，可以忽略这封邮件。"
    },
    passwordReset: {
      subject: (p) => `重置您的 ${p.brand} 密码`,
      heading: "重置密码",
      paragraphs: () => [
        "我们收到了重置密码的请求。请点击下方按钮设置新密码。",
        "此链接将在 1 小时后失效。"
      ],
      button: "重置密码",
      footer: "如果您没有请求重置密码，可以忽略这封邮件。"
    },
    receipt: {
      subject: (p) => `您的 ${p.brand} 收据`,
      heading: "已收到付款",
      paragraphs: (p) => [
        `感谢您订阅 ${escapeHtml(p.planName)}。`,
        `扣款金额：${escapeHtml(p.amount)}`,
        p.periodEnd ? `您的订阅有效期至 ${escapeHtml(p.periodEnd)}。` : ""
      ].filter(Boolean),
      button: "查看账单",
      footer: "这是一封自动发送的收据，供您留存。"
    },
    dunning: {
      subject: (p) => `需要处理：${p.brand} 付款失败`,
      heading: "您的付款未能完成",
      paragraphs: (p) => [
        `我们无法处理您 ${escapeHtml(p.amount)} 的付款。`,
        "请更新您的付款信息以保持订阅有效。"
      ],
      button: "更新付款方式",
      footer: "如果未更新付款信息，您的订阅可能会被取消。"
    }
  }
};

function localeStrings(locale) {
  return STRINGS[locale] || STRINGS[DEFAULT_EMAIL_LOCALE];
}

// Build a finished email ({ subject, html, text }) for the given template type.
function render(type, locale, params) {
  const copy = localeStrings(locale)[type];
  const subject = copy.subject(params);
  const heading = copy.heading;
  const paragraphsHtml = copy.paragraphs(params);
  const buttonLabel = copy.button;
  const buttonUrl = params.actionUrl || "";
  const html = layout({
    brand: params.brand,
    heading,
    paragraphs: paragraphsHtml,
    buttonLabel,
    buttonUrl,
    footer: copy.footer
  });
  const text = textBody({
    heading,
    lines: copy.paragraphs(params).map((line) => line.replace(/<[^>]+>/g, "")),
    buttonLabel,
    buttonUrl,
    footer: copy.footer
  });
  return { subject, html, text };
}

export const emailTemplates = {
  verification: (locale, params) => render("verification", locale, params),
  passwordReset: (locale, params) => render("passwordReset", locale, params),
  receipt: (locale, params) => render("receipt", locale, params),
  dunning: (locale, params) => render("dunning", locale, params)
};
