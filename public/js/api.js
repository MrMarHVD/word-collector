import { t } from "./i18n.js";
import { state } from "./state.js";

let unauthorizedHandler = () => {};

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export async function requestJson(url, options) {
  const response = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const payload = await response.json();
  if (response.status === 401) {
    state.user = null;
    unauthorizedHandler();
  }
  if (!response.ok) {
    throw new Error(payload.error || t("errors.requestFailed"));
  }
  return payload;
}
