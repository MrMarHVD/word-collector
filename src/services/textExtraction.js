import JSZip from "jszip";

// Convert supported document formats into plain text for tokenization.
// Strip tags and common XML entities from HTML-like content.
function stripXml(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

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
    return {
      fileType: "epub",
      text: await extractEpubText(file.buffer)
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

// Extract readable chapter text from HTML files inside an EPUB archive.
async function extractEpubText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.values(zip.files)
    .filter((file) => !file.dir && /\.(xhtml|html|htm)$/i.test(file.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const chapters = [];
  for (const file of files) {
    chapters.push(stripXml(await file.async("text")));
  }
  return chapters.filter(Boolean).join("\n\n");
}
