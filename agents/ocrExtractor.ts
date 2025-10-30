/**
 * Runs OCR on an image file buffer using Tesseract.js.
 * @param buffer The ArrayBuffer of the image file.
 * @param lang The language for OCR (defaults to 'por' for Portuguese).
 * @returns A promise that resolves to the extracted text.
 */
export async function runOCRFromImage(buffer: ArrayBuffer, lang = "por"): Promise<string> {
    const defaultLangPath = import.meta.env.VITE_TESSERACT_LANG_PATH ?? 'https://tessdata.projectnaptha.com/4.0.0';

    try {
        const { createWorker } = await import('tesseract.js');
        const workerSrc = (await import('tesseract.js/dist/worker.min.js?url')).default;
        const coreSrc = (await import('tesseract.js-core/tesseract-core.wasm.js?url')).default;

        const worker = await createWorker(undefined, undefined, {
            workerPath: workerSrc,
            corePath: coreSrc,
            langPath: defaultLangPath,
        });

        const typedWorker = worker as any;
        await typedWorker.load?.();
        if (typeof typedWorker.loadLanguage === 'function') {
            await typedWorker.loadLanguage(lang);
        }
        if (typeof typedWorker.initialize === 'function') {
            await typedWorker.initialize(lang);
        } else if (typeof typedWorker.reinitialize === 'function') {
            await typedWorker.reinitialize(lang);
        }

        const { data } = await typedWorker.recognize(new Uint8Array(buffer));
        await typedWorker.terminate?.();
        return data.text;
    } catch (error) {
        console.error('Tesseract OCR failed:', error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Falha ao executar OCR na imagem. Detalhes: ${message}`);
    }
}