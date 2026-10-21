import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { extractDocx, extractOpenDocument, extractPptx, extractSpreadsheet } from '../services/documentService';

const toArrayBuffer = (u8: Uint8Array) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

describe('extracción de documentos', () => {
    it('Excel y ODS: cada hoja como CSV', async () => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Producto', 'Precio'], ['Yerba', 3500]]), 'Ventas');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Total'], [3500]]), 'Resumen');
        for (const bookType of ['xlsx', 'ods'] as const) {
            const { text, sheets } = await extractSpreadsheet(XLSX.write(wb, { type: 'array', bookType }));
            expect(sheets).toBe(2);
            expect(text).toBe('## Hoja: Ventas\nProducto,Precio\nYerba,3500\n\n## Hoja: Resumen\nTotal\n3500');
        }
    });

    it('Word', async () => {
        const z = new JSZip();
        z.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
        z.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
        z.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Contrato</w:t></w:r></w:p><w:p><w:r><w:t>Cláusula 1</w:t></w:r></w:p></w:body></w:document>');
        expect(await extractDocx(toArrayBuffer(await z.generateAsync({ type: 'uint8array' })))).toBe('Contrato\n\nCláusula 1');
    });

    it('PowerPoint: diapositivas en orden numérico y notas', async () => {
        const z = new JSZip();
        z.file('ppt/slides/slide10.xml', '<p xmlns:a="a"><a:p><a:r><a:t>Diez</a:t></a:r></a:p></p>');
        z.file('ppt/slides/slide2.xml', '<p xmlns:a="a"><a:p><a:r><a:t>Dos &amp; más</a:t></a:r></a:p></p>');
        z.file('ppt/notesSlides/notesSlide2.xml', '<n xmlns:a="a"><a:t>nota</a:t></n>');
        const { text, slides } = await extractPptx(toArrayBuffer(await z.generateAsync({ type: 'uint8array' })));
        expect(slides).toBe(2);
        expect(text).toBe('## Diapositiva 1\nDos & más\n\nNotas: nota\n\n## Diapositiva 2\nDiez');
    });

    it('OpenDocument de texto', async () => {
        const z = new JSZip();
        z.file('content.xml', '<d xmlns:text="t"><text:h>Informe</text:h><text:p>Uno<text:tab/>dos</text:p></d>');
        expect(await extractOpenDocument(toArrayBuffer(await z.generateAsync({ type: 'uint8array' })))).toBe('Informe\nUno\tdos');
    });
});
