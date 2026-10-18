import { getResolvedPDFJS } from 'unpdf';

export const PDF_LIMITS = { bytes: 2000000, pages: 30, characters: 120000 };
const clean = value => value.normalize('NFKC').replace(/\s+/g, ' ').trim();
const emailPattern = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9-]+\.)+[a-z]{2,}/gi;

// Text only: never render images, execute actions, follow embedded links or fetch fonts.
// Page boundaries are evidence boundaries; adjacent pages cannot create an identity quote.
export async function extractPDFSource(bytes) {
  if (bytes.length > PDF_LIMITS.bytes) throw Error('PDF source exceeds 2 MB');
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw Error('Invalid PDF signature');
  let pdf, task;
  try {
    const { getDocument } = await getResolvedPDFJS();
    task = getDocument({ data: bytes.slice(),
      isEvalSupported: false, useSystemFonts: false, disableFontFace: true,
      useWorkerFetch: false, isOffscreenCanvasSupported: false,
      disableAutoFetch: true, disableStream: true, maxImageSize: 0,
      cMapUrl: undefined, standardFontDataUrl: undefined, wasmUrl: undefined,
      verbosity: 0, stopAtErrors: true,
    });
    pdf = await task.promise;
    if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1 || pdf.numPages > PDF_LIMITS.pages)
      throw Error('PDF source exceeds 30 pages or has invalid page count');
    const pages = [], contacts = [];
    let size = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      try {
        const stream = page.streamTextContent().getReader();
        const fragments = [];
        try {
          for (;;) {
            const { done, value } = await stream.read();
            if (done) break;
            for (const item of value.items) {
              if (typeof item.str !== 'string') continue;
              size += item.str.length + 1;
              if (size > PDF_LIMITS.characters) throw Error('PDF source exceeds 120000 text characters');
              fragments.push(item.str);
            }
          }
        } finally { await stream.cancel().catch(() => {}); }
        const text = clean(fragments.join(' '));
        pages.push({ page: number, text });
        for (const email of new Set((text.match(emailPattern) || []).map(x => x.toLowerCase()))) {
          if (contacts.length >= 100) break;
          const index = text.toLowerCase().indexOf(email);
          contacts.push({ email, page: number, publication: 'pdf_text', identity_verified: false,
            contexts: [text.slice(Math.max(0, index - 160), index + email.length + 160)] });
        }
      } finally { page.cleanup(); }
    }
    if (!pages.some(p => p.text)) throw Error('PDF has no extractable text; scanned/image-only sources require separate public evidence');
    return { text: pages.map(p => p.text).join('\n\n'), pages, total_pages: pdf.numPages,
      contacts, links: [], limitations: ['Text order may differ from visual columns; inspect the original layout before binding a name to an email.', 'No OCR, embedded attachments, scripts or mailbox verification. Publication and current employment must be checked separately.'] };
  } catch (error) {
    if (/Password/i.test(error?.name || '')) throw Error('Password-protected PDF source is not supported');
    throw error;
  } finally { if (task) await task.destroy(); }
}
