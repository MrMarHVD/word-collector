export async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) {
      throw new Error("Request body is too large.");
    }
  }
  return raw ? JSON.parse(raw) : {};
}
