import type { ImportedDoc } from '../types';
import { runOCRFromImage } from '../agents/ocrExtractor';
import { extractDataFromText } from '../agents/nlpAgent';
import { logger } from '../services/logger';
import { parseSafeFloat } from './parsingUtils';

import JSZip, { type JSZipObject } from 'jszip';
import Papa from 'papaparse';

// Set up PDF.js worker
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://aistudiocdn.com/pdfjs-dist@^4.8.69/build/pdf.worker.mjs`;


// --- Helper Functions ---

/**
 * Reads a file as a string, automatically detecting its character encoding.
 * It checks for UTF BOMs and falls back from UTF-8 to Windows-1252 if decoding fails.
 * @param file The file to read.
 * @returns A promise that resolves with the decoded text content of the file.
 */
const readFileWithDetectedEncoding = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(buffer);
    
    let encoding = 'utf-8'; // Default encoding
    
    // BOM (Byte Order Mark) Detection
    if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
        encoding = 'utf-8';
    } else if (uint8.length >= 2 && uint8[0] === 0xFE && uint8[1] === 0xFF) {
        encoding = 'utf-16be';
    } else if (uint8.length >= 2 && uint8[0] === 0xFF && uint8[1] === 0xFE) {
        encoding = 'utf-16le';
    }
    // More complex BOMs like UTF-32 are rare but could be added here.

    try {
        // Attempt to decode with the detected (or default) encoding.
        // `fatal: true` ensures an error is thrown for invalid byte sequences.
        const decoder = new TextDecoder(encoding, { fatal: true });
        return decoder.decode(buffer);
    } catch (e) {
        // If the primary decoding fails, it might be a legacy encoding.
        // Windows-1252 is a common fallback for files from older systems.
        logger.log('ImportPipeline', 'WARN', `Falha ao decodificar ${file.name} como ${encoding}, tentando fallback para windows-1252.`, { error: e });
        try {
            const fallbackDecoder = new TextDecoder('windows-1252');
            return fallbackDecoder.decode(buffer);
        } catch (fallbackError) {
            logger.log('ImportPipeline', 'ERROR', `Falha ao decodificar ${file.name} com qualquer codificação de fallback.`, { error: fallbackError });
            throw new Error(`Não foi possível decodificar o arquivo ${file.name}. A codificação de caracteres pode ser desconhecida ou o arquivo está corrompido.`);
        }
    }
};


const getFileExtension = (filename: string): string => {
    return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2).toLowerCase();
};

const sanitizeFilename = (filename: string): string => {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Safely extracts the primitive value from a fast-xml-parser node,
 * which might be a direct value or an object with a text node (e.g., { '#text': 'value' }).
 * @param field The raw field from the parsed XML object.
 * @returns The primitive value (string, number, etc.) or undefined.
 */
const getXmlValue = (field: any): any => {
    if (field === null || field === undefined) return undefined;
    if (typeof field === 'object') {
        if (field['#text'] !== undefined) return field['#text'];
        if (Object.keys(field).length === 0) return undefined;
    }
    return field;
};

/**
 * [CORREÇÃO DE ROBUSTEZ] Encontra inteligentemente o bloco de dados de imposto real (ex: ICMS00, PISAliq)
 * dentro de seu contêiner pai (ex: ICMS, PIS) sem precisar saber a chave exata.
 * Isso torna a análise resiliente a diferentes códigos CST.
 * @param taxParent O objeto de imposto pai (ex: o objeto para a tag <ICMS>).
 * @returns O objeto do bloco de imposto interno, ou um objeto vazio se não encontrado.
 */
const getInnerTaxBlock = (taxParent: any): any => {
    if (!taxParent || typeof taxParent !== 'object') {
        return {};
    }
    // O bloco interno é frequentemente a primeira e única propriedade do pai.
    // ex: <ICMS><ICMS00>...</ICMS00></ICMS> -> { ICMS: { ICMS00: {...} } }
    const keys = Object.keys(taxParent);
    if (keys.length > 0) {
        // Encontra a primeira chave que corresponde a um objeto, pois este é provavelmente o bloco de imposto.
        const innerKey = keys.find(k => typeof taxParent[k] === 'object' && taxParent[k] !== null);
        if (innerKey) {
            return taxParent[innerKey];
        }
    }
    return {};
};


/**
 * [RECONSTRUÍDO] Normaliza os dados da NFe de um objeto JSON analisado a partir do XML para um array achatado de registros de itens.
 * Esta função foi reconstruída para robustez e clareza, corrigindo falhas sistêmicas de parsing.
 * Ela acessa objetos diretamente e usa helpers apenas para seus propósitos pretendidos.
 * @param nfeData O objeto JSON bruto do parser de XML.
 * @returns Um array de registros, onde cada registro representa um item de linha enriquecido com dados do cabeçalho.
 */
const normalizeNFeData = (nfeData: any): Record<string, any>[] => {
    const infNFe = nfeData?.nfeProc?.NFe?.infNFe || nfeData?.NFe?.infNFe || nfeData?.infNFe;
    if (!infNFe) {
        logger.log('ImportPipeline', 'ERROR', 'Bloco <infNFe> não encontrado no XML. O documento não pode ser processado.');
        return [];
    }

    const maskCnpj = (cnpj: string | undefined): string | undefined => {
        if (!cnpj || cnpj.length < 14) return cnpj; // Only mask valid full CNPJs
        // Returns XX.XXX.XXX/****-XX format by masking the middle part
        return `${cnpj.substring(0, 8)}****${cnpj.substring(12)}`;
    };

    const items = Array.isArray(infNFe.det) ? infNFe.det : (infNFe.det ? [infNFe.det] : []);
    if (items.length === 0) {
        logger.log('ImportPipeline', 'WARN', 'Nenhum item <det> encontrado no XML.');
        return [];
    }
    
    const ide = infNFe.ide || {};
    const emit = infNFe.emit || {};
    const dest = infNFe.dest || {};
    const total = infNFe.total || {};
    const icmsTot = total.ICMSTot || {};
    const issqnTot = total.ISSQNtot || {};
    
    // [CORREÇÃO CRÍTICA] Lê corretamente o atributo 'Id' da tag <infNFe>.
    // Isso resolve o erro "0 Documentos Válidos" ao fornecer um ID único para cada documento.
    const nfeId = infNFe['@_Id'];
    if (!nfeId) {
        logger.log('ImportPipeline', 'ERROR', 'Atributo "Id" da NFe não foi encontrado na tag <infNFe>. A contagem de documentos pode ser imprecisa.');
    }

    // --- Reconstrução Inteligente do Valor Total ---
    let nfeTotalValue = parseSafeFloat(getXmlValue(icmsTot.vNF));
    if (nfeTotalValue === 0) {
        const totalProducts = parseSafeFloat(getXmlValue(icmsTot.vProd));
        const totalServices = parseSafeFloat(getXmlValue(issqnTot.vServ));
        nfeTotalValue = totalProducts + totalServices;
        if (nfeTotalValue > 0) {
            logger.log('ImportPipeline', 'WARN', `vNF ausente/zerado na NFe ${nfeId}. Total reconstruído: R$ ${nfeTotalValue}`);
        }
    }

    return items.map((item: any) => {
        const prod = item.prod || {};
        const imposto = item.imposto || {};

        // [CORREÇÃO DE ROBUSTEZ] Usa o helper inteligente para encontrar os dados do imposto, corrigindo valores zerados.
        const icmsBlock = getInnerTaxBlock(imposto.ICMS);
        const pisBlock = getInnerTaxBlock(imposto.PIS);
        const cofinsBlock = getInnerTaxBlock(imposto.COFINS);
        const issqnBlock = imposto.ISSQN || {}; // ISSQN não tem uma estrutura aninhada
        
        const enderEmit = emit.enderEmit || {};
        const enderDest = dest.enderDest || {};

        return {
            nfe_id: nfeId,
            data_emissao: getXmlValue(ide.dhEmi),
            valor_total_nfe: nfeTotalValue,
            emitente_nome: getXmlValue(emit.xNome),
            emitente_cnpj: maskCnpj(getXmlValue(emit.CNPJ)),
            emitente_uf: getXmlValue(enderEmit.UF),
            destinatario_nome: getXmlValue(dest.xNome),
            destinatario_cnpj: maskCnpj(getXmlValue(dest.CNPJ)),
            destinatario_uf: getXmlValue(enderDest.UF),
            produto_nome: getXmlValue(prod.xProd),
            produto_ncm: getXmlValue(prod.NCM),
            produto_cfop: getXmlValue(prod.CFOP),
            produto_cst_icms: getXmlValue(icmsBlock.CST),
            produto_base_calculo_icms: parseSafeFloat(getXmlValue(icmsBlock.vBC)),
            produto_aliquota_icms: parseSafeFloat(getXmlValue(icmsBlock.pICMS)),
            produto_valor_icms: parseSafeFloat(getXmlValue(icmsBlock.vICMS)),
            produto_cst_pis: getXmlValue(pisBlock.CST),
            produto_valor_pis: parseSafeFloat(getXmlValue(pisBlock.vPIS)),
            produto_cst_cofins: getXmlValue(cofinsBlock.CST),
            produto_valor_cofins: parseSafeFloat(getXmlValue(cofinsBlock.vCOFINS)),
            produto_valor_iss: parseSafeFloat(getXmlValue(issqnBlock.vISSQN)),
            produto_qtd: parseSafeFloat(getXmlValue(prod.qCom)),
            produto_valor_unit: parseSafeFloat(getXmlValue(prod.vUnCom)),
            produto_valor_total: parseSafeFloat(getXmlValue(prod.vProd)),
        };
    });
};


// --- Individual File Handlers ---

const handleXML = async (file: File): Promise<ImportedDoc> => {
    try {
        const { XMLParser } = await import('fast-xml-parser');
        const text = await readFileWithDetectedEncoding(file);
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            textNodeName: "#text", 
            allowBooleanAttributes: true,
            parseTagValue: false, 
            parseAttributeValue: false,
        });
        const jsonObj = parser.parse(text);
        const data = normalizeNFeData(jsonObj);

        if (data.length === 0) {
            return { kind: 'NFE_XML', name: file.name, size: file.size, status: 'error', error: 'Nenhum item de produto encontrado no XML ou XML malformado.', raw: file };
        }
        return { kind: 'NFE_XML', name: file.name, size: file.size, status: 'parsed', data, raw: file };
    } catch (e: unknown) {
// FIX: Renamed 'error' to 'e' to resolve a "Cannot find name 'error'" compilation error.
        const message = e instanceof Error ? e.message : String(e);
        logger.log('ImportPipeline', 'ERROR', `Erro crítico ao processar XML: ${file.name}`, { error: e });
        return { kind: 'NFE_XML', name: file.name, size: file.size, status: 'error', error: `Erro ao processar XML: ${message}`, raw: file };
    }
};

const handleCSV = async (file: File): Promise<ImportedDoc> => {
    try {
        const text = await readFileWithDetectedEncoding(file);
        return new Promise((resolve) => {
            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
                transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
                complete: (results) => {
                    resolve({ kind: 'CSV', name: file.name, size: file.size, status: 'parsed', data: results.data as Record<string, any>[], raw: file });
                },
                error: (error: unknown) => {
                    const message = error instanceof Error ? error.message : String(error);
                    resolve({ kind: 'CSV', name: file.name, size: file.size, status: 'error', error: `Erro ao processar CSV: ${message}`, raw: file });
                },
            });
        });
    } catch (e) {
// FIX: Renamed 'error' to 'e' to resolve a "Cannot find name 'error'" compilation error.
        const message = e instanceof Error ? e.message : String(e);
        return { kind: 'CSV', name: file.name, size: file.size, status: 'error', error: message, raw: file };
    }
};

const handleXLSX = async (file: File): Promise<ImportedDoc> => {
    try {
        const { read, utils } = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = utils.sheet_to_json(worksheet) as Record<string, any>[];
        return { kind: 'XLSX', name: file.name, size: file.size, status: 'parsed', data, raw: file };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { kind: 'XLSX', name: file.name, size: file.size, status: 'error', error: `Erro ao processar XLSX: ${message}`, raw: file };
    }
};

const handleImage = async (file: File): Promise<ImportedDoc> => {
    try {
        const buffer = await file.arrayBuffer();
        const text = await runOCRFromImage(buffer);
        if (!text.trim()) {
            return { kind: 'IMAGE', name: file.name, size: file.size, status: 'error', error: 'Nenhum texto detectado na imagem (OCR).', raw: file };
        }
         const data = await extractDataFromText(text);
        if (data.length === 0) {
            logger.log('nlpAgent', 'WARN', `Nenhum dado estruturado extraído do texto da imagem ${file.name}`);
        }
        return { kind: 'IMAGE', name: file.name, size: file.size, status: 'parsed', text, data, raw: file };
    } catch (e: unknown) {
// FIX: Renamed 'error' to 'e' to resolve a "Cannot find name 'error'" compilation error.
        const message = e instanceof Error ? e.message : String(e);
        return { kind: 'IMAGE', name: file.name, size: file.size, status: 'error', error: message, raw: file };
    }
};

const handlePDF = async (file: File): Promise<ImportedDoc> => {
    try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(buffer).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map((item: any) => item.str).join(' ');
        }
        
        let doc: ImportedDoc = { kind: 'PDF', name: file.name, size: file.size, status: 'parsed', text: fullText, raw: file };

        if (fullText.trim().length > 10) { // Check if text was extracted
             const data = await extractDataFromText(fullText);
             if (data.length === 0) {
                logger.log('nlpAgent', 'WARN', `Nenhum dado estruturado extraído do texto do PDF ${file.name}`);
             }
             doc.data = data;
        } else {
            logger.log('ocrExtractor', 'INFO', `PDF ${file.name} sem texto, tentando OCR.`);
            const ocrText = await runOCRFromImage(buffer);
            if (!ocrText.trim()) {
                throw new Error("Documento PDF parece estar vazio ou não contém texto legível (falha no OCR).");
            }
            doc.text = ocrText;
            doc.data = await extractDataFromText(ocrText);
        }
        return doc;

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { kind: 'PDF', name: file.name, size: file.size, status: 'error', error: `Falha no processamento do PDF: ${message}`, raw: file };
    }
};

const handleUnsupported = (file: File, reason: string): ImportedDoc => ({
    kind: 'UNSUPPORTED', name: file.name, size: file.size, status: 'unsupported', raw: file, error: reason,
});

// --- Main Pipeline ---

const isSupportedExtension = (name: string): boolean => {
    const supportedExtensions = ['.xml', '.csv', '.xlsx', '.xls', '.pdf', '.jpg', '.jpeg', '.png', '.zip'];
    return supportedExtensions.some(ext => name.toLowerCase().endsWith(ext));
};

const processSingleFile = async (file: File): Promise<ImportedDoc> => {
    const sanitizedName = sanitizeFilename(file.name);
    if(sanitizedName !== file.name) {
        logger.log('ImportPipeline', 'WARN', `Nome de arquivo sanitizado: de '${file.name}' para '${sanitizedName}'`);
        file = new File([file], sanitizedName, { type: file.type });
    }

    const extension = getFileExtension(file.name);
    switch (extension) {
        case 'xml': return handleXML(file);
        case 'csv': return handleCSV(file);
        case 'xlsx': case 'xls': return handleXLSX(file);
        case 'pdf': return handlePDF(file);
        case 'png': case 'jpg': case 'jpeg': return handleImage(file);
        default: return Promise.resolve(handleUnsupported(file, 'Extensão de arquivo não suportada.'));
    }
};

export const importFiles = async (
    files: File[],
    onProgress: (current: number, total: number) => void
): Promise<ImportedDoc[]> => {
    const allDocsPromises: Promise<ImportedDoc | ImportedDoc[]>[] = [];
    let progressCounter = 0;

    onProgress(0, files.length);

    for (const file of files) {
        const promise = (async () => {
            let result: ImportedDoc | ImportedDoc[];
            const extension = getFileExtension(file.name);

            if (extension === 'zip') {
                try {
                    logger.log('ImportPipeline', 'INFO', `Descompactando arquivo zip: ${file.name}`);
                    const jszip = new JSZip();
                    const zip = await jszip.loadAsync(file);
                    
                    const allFileEntries = Object.values(zip.files).filter(
                        (zipFile: JSZipObject) => !zipFile.dir && !zipFile.name.startsWith('__MACOSX/') && !zipFile.name.endsWith('.DS_Store')
                    );
            
                    const supportedFileEntries = allFileEntries.filter(
                        (zipFile: JSZipObject) => isSupportedExtension(zipFile.name)
                    );
                    
                    if (supportedFileEntries.length === 0) {
                        let reason = 'O arquivo ZIP está vazio.';
                        if (allFileEntries.length > 0) {
                            const foundFiles = allFileEntries.map((f: JSZipObject) => f.name).slice(0, 5).join(', ');
                            reason = `O ZIP não contém arquivos com formato suportado. Arquivos encontrados: ${foundFiles}${allFileEntries.length > 5 ? '...' : ''}.`;
                        }
                        result = { kind: 'UNSUPPORTED', name: file.name, size: file.size, status: 'error', error: reason };
            
                    } else {
                        const innerDocs = await Promise.all(supportedFileEntries.map(async (zipEntry: JSZipObject) => {
                            const blob = await zipEntry.async('blob');
                            const innerFile = new File([blob], zipEntry.name, { type: blob.type });
                            const doc = await processSingleFile(innerFile);
                            doc.meta = { source_zip: file.name, internal_path: zipEntry.name };
                            return doc;
                        }));
                        result = innerDocs;
                        logger.log('ImportPipeline', 'INFO', `Processados ${innerDocs.length} arquivos de dentro de ${file.name}`);
                    }
            
                } catch (e: unknown) {
                    let message: string;
                    if (e instanceof Error) {
                        message = e.message;
                    } else {
                        message = String(e);
                    }
                    const errorMsg = `Falha ao descompactar ou processar o arquivo ZIP: ${message}`;
                    logger.log('ImportPipeline', 'ERROR', errorMsg, {fileName: file.name, error: e});
                    result = { kind: 'UNSUPPORTED', name: file.name, size: file.size, status: 'error', error: errorMsg };
                }
            } else if (isSupportedExtension(file.name)) {
                result = await processSingleFile(file);
            } else {
                 result = handleUnsupported(file, 'Extensão de arquivo não suportada.');
            }

            const logResult = (doc: ImportedDoc) => {
                if (doc.status === 'error' || doc.status === 'unsupported') {
                    logger.log('ImportPipeline', 'ERROR', `Falha ao processar ${doc.name}: ${doc.error}`, { status: doc.status });
                } else {
                     logger.log('ImportPipeline', 'INFO', `Arquivo ${doc.name} processado com sucesso.`);
                }
            };
            Array.isArray(result) ? result.forEach(logResult) : logResult(result);

            progressCounter++;
            onProgress(progressCounter, files.length);
            return result;
        })();
        allDocsPromises.push(promise);
    }

    const results = await Promise.all(allDocsPromises);
    return results.flat();
};