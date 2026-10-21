/**
 * ============================================================================
 * DOCUMENT SERVICE - Sacar el texto de documentos para que el modelo los lea
 * ============================================================================
 *
 * EDUCATIVO: casi ningún modelo "abre" un .docx o un .xlsx. Lo que se hace es
 * convertirlos a texto antes de mandarlos:
 *   - Word (.docx)            -> mammoth
 *   - Excel / ODS / CSV       -> SheetJS, cada hoja como CSV
 *   - PowerPoint (.pptx)      -> el .pptx es un ZIP de XML: se leen los <a:t> de cada diapositiva
 *   - OpenDocument (.odt/.odp)-> también ZIP: se lee content.xml
 *   - PDF                     -> pdf.js (para proveedores que no aceptan PDF nativo)
 *
 * Las librerías se cargan recién cuando hacen falta (import dinámico), así la
 * app no pesa más para quien nunca sube un documento.
 */

/** Límite de texto que se manda al modelo por archivo (≈ 100 k tokens) */
export const MAX_EXTRACTED_CHARS = 400_000;

const clip = (text: string) => text.length > MAX_EXTRACTED_CHARS
    ? `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n[… texto recortado: el archivo original tiene ${text.length.toLocaleString()} caracteres]`
    : text;

const xmlText = (xml: string, tag: RegExp) => {
    const out: string[] = [];
    for (const m of xml.matchAll(tag)) out.push(m[1]);
    return out.join('')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
};

export async function extractDocx(buf: ArrayBuffer): Promise<string> {
    const mammoth = await import('mammoth');
    // El build de navegador de mammoth lee `arrayBuffer`; el de Node (tests, servidor) lee `buffer`
    const input: any = typeof Buffer !== 'undefined' ? { buffer: Buffer.from(buf) } : { arrayBuffer: buf };
    const { value } = await mammoth.extractRawText(input);
    return clip(value.trim());
}

export async function extractSpreadsheet(buf: ArrayBuffer): Promise<{ text: string; sheets: number }> {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const parts = wb.SheetNames.map(name => {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
        return `## Hoja: ${name}\n${csv.trim()}`;
    });
    return { text: clip(parts.join('\n\n')), sheets: wb.SheetNames.length };
}

export async function extractPptx(buf: ArrayBuffer): Promise<{ text: string; slides: number }> {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buf);
    const slideFiles = Object.keys(zip.files)
        .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
        .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
    const slides: string[] = [];
    for (const [i, f] of slideFiles.entries()) {
        const xml = await zip.file(f)!.async('string');
        // Cada párrafo <a:p> en una línea
        const paragraphs = xml.split(/<\/a:p>/).map(p => xmlText(p, /<a:t>([^<]*)<\/a:t>/g)).filter(Boolean);
        const notesFile = `ppt/notesSlides/notesSlide${f.match(/(\d+)\.xml$/)![1]}.xml`;
        const notes = zip.file(notesFile) ? xmlText(await zip.file(notesFile)!.async('string'), /<a:t>([^<]*)<\/a:t>/g) : '';
        slides.push(`## Diapositiva ${i + 1}\n${paragraphs.join('\n')}${notes ? `\n\nNotas: ${notes}` : ''}`);
    }
    return { text: clip(slides.join('\n\n')), slides: slides.length };
}

export async function extractOpenDocument(buf: ArrayBuffer): Promise<string> {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('content.xml')?.async('string');
    if (!xml) throw new Error('No es un documento OpenDocument válido.');
    const text = xml
        .replace(/<text:(p|h)[^>]*>/g, '\n')
        .replace(/<text:tab\/>/g, '\t')
        .replace(/<text:line-break\/>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    return clip(text.replace(/\n{3,}/g, '\n\n').trim());
}

export async function extractPdf(buf: ArrayBuffer): Promise<{ text: string; pages: number }> {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
    const doc = await task.promise;
    const pages: string[] = [];
    let total = 0;
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((it: any) => ('str' in it ? it.str + (it.hasEOL ? '\n' : '') : '')).join('');
        pages.push(`--- Página ${i} ---\n${text.trim()}`);
        total += text.length;
        if (total > MAX_EXTRACTED_CHARS) break;
    }
    await task.destroy();   // libera el worker
    return { text: clip(pages.join('\n\n')), pages: doc.numPages };
}
