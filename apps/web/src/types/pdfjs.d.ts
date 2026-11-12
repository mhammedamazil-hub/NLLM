declare module 'pdfjs-dist/build/pdf.mjs' {
  export function getDocument(src: { data: ArrayBuffer | Uint8Array; password?: string } | string): {
    promise: Promise<PdfDocument>;
  };
  export interface PdfDocument {
    numPages: number;
    getPage(n: number): Promise<PdfPage>;
  }
  export interface PdfPage {
    getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
  }
}
