// lib/pdf2img.ts
export interface PdfConversionResult {
  imageUrl: string;
  file: File | null;
  error?: string;
}

let pdfjsLib: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;
  if (loadPromise) return loadPromise;

  // Never attempt to load pdf.js on the server
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('pdf.js can only be loaded in the browser');
  }

  isLoading = true;
  loadPromise = (async () => {
    try {
      // Dynamically import the library and the worker URL only in the browser
      const lib: any = await import('pdfjs-dist');
      const workerModule: any = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');

      // Use bundler-emitted worker URL (no public/ copy needed)
      lib.GlobalWorkerOptions.workerSrc = workerModule.default || workerModule;

      pdfjsLib = lib;
      return lib;
    } finally {
      isLoading = false;
    }
  })();

  return loadPromise;
}

export async function convertPdfToImage(file: File): Promise<PdfConversionResult> {
  try {
    // Guard against SSR / non-browser contexts
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return { imageUrl: '', file: null, error: 'Must run in a browser context' };
    }

    // Basic validation
    if (file.type !== 'application/pdf') {
      return { imageUrl: '', file: null, error: 'Selected file is not a PDF' };
    }

    const lib = await loadPdfJs();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 4 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      return { imageUrl: '', file: null, error: 'Failed to get 2D canvas context' };
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    await page.render({ canvasContext: context, viewport }).promise;

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            // Create a File from the blob with the same name as the pdf
            const originalName = file.name.replace(/\.pdf$/i, '');
            const imageFile = new File([blob], `${originalName}.png`, {
              type: 'image/png',
            });

            resolve({
              imageUrl: URL.createObjectURL(blob),
              file: imageFile,
            });
          } else {
            resolve({
              imageUrl: '',
              file: null,
              error: 'Failed to create image blob',
            });
          }
        },
        'image/png',
        1.0
      );
    });
  } catch (err: any) {
    return {
      imageUrl: '',
      file: null,
      error: `Failed to convert PDF: ${err?.message || String(err)}`,
    };
  }
}
