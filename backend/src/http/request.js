// Request body helpers used by API routes.
// Read and parse a bounded JSON request body.
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

// Read a request body into a Buffer while enforcing a maximum size.
export async function readBuffer(req, maxBytes = 40_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Parse multipart form data into field strings and uploaded file buffers.
export async function readMultipart(req, maxBytes = 40_000_000) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new Error("Multipart boundary is missing.");
  }

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const body = await readBuffer(req, maxBytes);
  const fields = {};
  const files = {};
  let offset = 0;

  // Parse the simple browser FormData shape used by material uploads.
  while (offset < body.length) {
    const boundaryStart = body.indexOf(boundary, offset);
    if (boundaryStart === -1) break;
    const partStart = boundaryStart + boundary.length;
    if (body.slice(partStart, partStart + 2).toString() === "--") break;
    const headersStart = partStart + 2;
    const headersEnd = body.indexOf(Buffer.from("\r\n\r\n"), headersStart);
    if (headersEnd === -1) break;

    const headers = body.slice(headersStart, headersEnd).toString("utf8");
    const nextBoundary = body.indexOf(boundary, headersEnd + 4);
    if (nextBoundary === -1) break;
    const content = body.slice(headersEnd + 4, Math.max(headersEnd + 4, nextBoundary - 2));
    const disposition = headers.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || "";
    const name = disposition.match(/name="([^"]+)"/i)?.[1];
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1];
    const type = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";

    if (name && filename !== undefined) {
      files[name] = { filename, type, buffer: content };
    } else if (name) {
      fields[name] = content.toString("utf8");
    }
    offset = nextBoundary;
  }

  return { fields, files };
}
