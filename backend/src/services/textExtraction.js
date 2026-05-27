import { appendFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import JSZip from "jszip";
import { EPUB_IMPORT_LOG, ROOT } from "../config.js";

// Resolve the configured log sink once so each call is a fast string check.
const LOG_SINK = (() => {
  if (!EPUB_IMPORT_LOG || EPUB_IMPORT_LOG === "off") return null;
  if (EPUB_IMPORT_LOG === "stdout") return { kind: "stdout" };
  const target = isAbsolute(EPUB_IMPORT_LOG) ? EPUB_IMPORT_LOG : join(ROOT, EPUB_IMPORT_LOG);
  return { kind: "file", path: target };
})();

function epubLog(event, data) {
  if (!LOG_SINK) return;
  const payload = data === undefined ? "" : ` ${JSON.stringify(data)}`;
  const line = `[epub ${new Date().toISOString()}] ${event}${payload}\n`;
  if (LOG_SINK.kind === "stdout") {
    process.stdout.write(line);
    return;
  }
  try {
    appendFileSync(LOG_SINK.path, line);
  } catch (error) {
    process.stderr.write(`[epub] log write failed: ${error.message}\n`);
  }
}

// Convert supported document formats into plain text or structured blocks.
// Detect the uploaded file type and extract text with the matching parser.
export async function extractTextFromUpload(file) {
  const filename = file.filename || "Untitled";
  const lowerName = filename.toLowerCase();
  if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
    return {
      fileType: "pdf",
      text: await extractPdfText(file.buffer)
    };
  }
  if (lowerName.endsWith(".epub") || file.type === "application/epub+zip") {
    epubLog("import.start", { filename, bytes: file.buffer?.length || 0 });
    const blocks = await extractEpubBlocks(file.buffer);
    return {
      fileType: "epub",
      blocks
    };
  }
  if (lowerName.endsWith(".txt") || file.type.startsWith("text/")) {
    return {
      fileType: "txt",
      text: file.buffer.toString("utf8")
    };
  }
  throw new Error("Upload a PDF, EPUB, or text file.");
}

// Extract text content from each page of a PDF buffer.
async function extractPdfText(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false, disableFontFace: true }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  return pages.join("\n\n");
}

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•"
};

// Decode HTML entities including named, decimal, and hex references.
function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]+);/g, (match, body) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith("#")) {
      const code = parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const replacement = NAMED_ENTITIES[body];
    return replacement === undefined ? match : replacement;
  });
}

// Collapse internal runs of whitespace within a block to single spaces; trim ends.
function normalizeBlockText(value) {
  return value.replace(/\s+/g, " ").trim();
}

// Resolve a relative href against a base directory path inside the EPUB archive.
function resolveEpubPath(baseDir, href) {
  const cleaned = href.split("#")[0];
  if (!cleaned) return "";
  const segments = (baseDir ? baseDir.split("/") : []).filter(Boolean);
  for (const part of cleaned.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  return segments.join("/");
}

const BLOCK_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "blockquote", "li"]);
const SKIP_CONTAINER_TAGS = new Set(["script", "style", "head", "nav"]);
const VOID_TAGS = new Set(["br", "hr", "img", "meta", "link", "input", "area", "base", "col", "embed", "param", "source", "track", "wbr"]);

function blockTypeFor(tagName) {
  if (tagName === "p") return "paragraph";
  if (tagName === "blockquote") return "blockquote";
  if (tagName === "li") return "list-item";
  if (/^h[1-6]$/.test(tagName)) return `heading-${tagName[1]}`;
  return "";
}

// Walk an XHTML document and emit one block per top-level block element.
// The walker is intentionally minimal: it tracks the innermost block ancestor
// and accumulates text into it, ignoring nested block boundaries inside (a
// rare but legal case like <p><blockquote>... in some EPUBs is flattened to
// the outer block, which keeps the model flat as designed).
function walkXhtml(xhtml) {
  const blocks = [];
  let inBody = false;
  let skipDepth = 0;
  let currentBlock = null;
  let currentDepth = 0;
  const stack = [];
  let i = 0;
  const length = xhtml.length;

  while (i < length) {
    const ch = xhtml[i];
    if (ch === "<") {
      // Comment.
      if (xhtml.startsWith("<!--", i)) {
        const end = xhtml.indexOf("-->", i + 4);
        i = end === -1 ? length : end + 3;
        continue;
      }
      // Processing instruction or declaration.
      if (xhtml[i + 1] === "?" || xhtml[i + 1] === "!") {
        const end = xhtml.indexOf(">", i + 1);
        i = end === -1 ? length : end + 1;
        continue;
      }
      const end = xhtml.indexOf(">", i + 1);
      if (end === -1) break;
      const raw = xhtml.slice(i + 1, end);
      i = end + 1;
      const isClose = raw.startsWith("/");
      const body = isClose ? raw.slice(1) : raw;
      const selfClosing = !isClose && body.endsWith("/");
      const cleaned = selfClosing ? body.slice(0, -1) : body;
      const nameMatch = cleaned.match(/^\s*([a-zA-Z][a-zA-Z0-9:_-]*)/);
      if (!nameMatch) continue;
      const tagName = nameMatch[1].toLowerCase();

      if (isClose) {
        if (tagName === "body") {
          inBody = false;
          continue;
        }
        if (SKIP_CONTAINER_TAGS.has(tagName) && skipDepth > 0) {
          skipDepth -= 1;
          continue;
        }
        // Close current block when its opening tag pops off the stack.
        if (stack.length && stack[stack.length - 1] === tagName) {
          stack.pop();
          if (currentBlock && stack.length < currentDepth) {
            const text = normalizeBlockText(currentBlock.text);
            if (text) blocks.push({ type: currentBlock.type, text });
            currentBlock = null;
            currentDepth = 0;
          }
        }
        continue;
      }

      if (tagName === "body") {
        inBody = true;
        continue;
      }
      if (!inBody) continue;

      if (SKIP_CONTAINER_TAGS.has(tagName)) {
        if (!selfClosing) skipDepth += 1;
        continue;
      }
      if (skipDepth > 0) {
        if (!selfClosing && !VOID_TAGS.has(tagName)) stack.push(tagName);
        continue;
      }

      if (tagName === "br") {
        if (currentBlock) currentBlock.text += " ";
        continue;
      }
      if (VOID_TAGS.has(tagName) || selfClosing) {
        continue;
      }

      const type = blockTypeFor(tagName);
      if (type && !currentBlock) {
        currentBlock = { type, text: "" };
        currentDepth = stack.length + 1;
      }
      stack.push(tagName);
      continue;
    }

    // Text node.
    const next = xhtml.indexOf("<", i);
    const slice = next === -1 ? xhtml.slice(i) : xhtml.slice(i, next);
    i = next === -1 ? length : next;
    if (!inBody || skipDepth > 0 || !currentBlock) continue;
    if (!slice) continue;
    currentBlock.text += decodeEntities(slice);
  }

  if (currentBlock) {
    const text = normalizeBlockText(currentBlock.text);
    if (text) blocks.push({ type: currentBlock.type, text });
  }
  return blocks;
}

// Read the EPUB container to locate the OPF file path.
async function readOpfPath(zip) {
  const container = zip.file("META-INF/container.xml");
  if (!container) {
    epubLog("opf.containerMissing");
    return "";
  }
  const xml = await container.async("text");
  const match = xml.match(/<rootfile[^>]*full-path=("([^"]+)"|'([^']+)')/i);
  const path = match ? (match[2] || match[3] || "") : "";
  epubLog("opf.path", { path });
  return path;
}

// Parse the OPF and return ordered XHTML paths from the spine.
async function readSpineDocuments(zip, opfPath) {
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    epubLog("spine.opfMissing", { opfPath });
    return [];
  }
  const opf = await opfFile.async("text");
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";

  const manifest = new Map();
  const itemRegex = /<item\b([^>]*)\/?>/gi;
  let match;
  while ((match = itemRegex.exec(opf)) !== null) {
    const attrs = match[1];
    const idMatch = attrs.match(/\bid\s*=\s*("([^"]*)"|'([^']*)')/i);
    const hrefMatch = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!idMatch || !hrefMatch) continue;
    const id = idMatch[2] || idMatch[3] || "";
    const href = hrefMatch[2] || hrefMatch[3] || "";
    manifest.set(id, href);
  }

  const spineMatch = opf.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i);
  if (!spineMatch) {
    epubLog("spine.missing", { manifestItems: manifest.size });
    return [];
  }
  const itemRefRegex = /<itemref\b([^>]*)\/?>/gi;
  const ordered = [];
  let unresolved = 0;
  while ((match = itemRefRegex.exec(spineMatch[1])) !== null) {
    const idMatch = match[1].match(/\bidref\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!idMatch) continue;
    const idref = idMatch[2] || idMatch[3] || "";
    const href = manifest.get(idref);
    if (!href) {
      unresolved += 1;
      epubLog("spine.itemrefUnresolved", { idref });
      continue;
    }
    ordered.push(resolveEpubPath(opfDir, decodeEntities(href)));
  }
  epubLog("spine.resolved", { manifestItems: manifest.size, spineItems: ordered.length, unresolved });
  return ordered;
}

// Extract structured blocks from an EPUB archive following spine order.
async function extractEpubBlocks(buffer) {
  const startMs = Date.now();
  const zip = await JSZip.loadAsync(buffer);
  epubLog("zip.loaded", { entries: Object.keys(zip.files).length, ms: Date.now() - startMs });

  const opfPath = await readOpfPath(zip);
  let paths = opfPath ? await readSpineDocuments(zip, opfPath) : [];
  if (!paths.length) {
    // Fallback: alphabetical ordering when the OPF or spine is unreadable.
    paths = Object.values(zip.files)
      .filter((file) => !file.dir && /\.(xhtml|html|htm)$/i.test(file.name))
      .map((file) => file.name)
      .sort((a, b) => a.localeCompare(b));
    epubLog("spine.fallbackAlphabetical", { documents: paths.length });
  }

  const blocks = [];
  const typeCounts = {};
  let totalChars = 0;
  let missingDocs = 0;
  for (const path of paths) {
    const file = zip.file(path);
    if (!file) {
      missingDocs += 1;
      epubLog("doc.missing", { path });
      continue;
    }
    const docStart = Date.now();
    const xhtml = await file.async("text");
    const docBlocks = walkXhtml(xhtml);
    let docChars = 0;
    for (const block of docBlocks) {
      blocks.push(block);
      typeCounts[block.type] = (typeCounts[block.type] || 0) + 1;
      docChars += block.text.length;
    }
    totalChars += docChars;
    epubLog("doc.parsed", { path, bytes: xhtml.length, blocks: docBlocks.length, chars: docChars, ms: Date.now() - docStart });
  }
  epubLog("import.done", { documents: paths.length, missingDocs, totalBlocks: blocks.length, totalChars, typeCounts, ms: Date.now() - startMs });
  return blocks;
}

