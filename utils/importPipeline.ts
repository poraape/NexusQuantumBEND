

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

const readFileWithDetectedEncoding = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(buffer);
    
    let detectedEncoding: string | null = null;
    let offset = 0;

    // Enhanced BOM (Byte Order Mark) Detection
    if (uint8.length >= 4) {
        if (uint8[0] === 0x00 && uint8[1] === 0x00 && uint8[2] === 0xFE && uint8[3] === 0xFF) {
            detectedEncoding = 'utf-32be';
            offset = 4;
        } else if (uint8[0] === 0xFF && uint8[1] === 0xFE && uint8[2] === 0x00 && uint8[3] === 0x00) {
            detectedEncoding = 'utf-32le';
            offset = 4;
        }
    }
    if (!detectedEncoding && uint8.length >= 2) {
        if (uint8[0] === 0xFE && uint8[1] === 0xFF) {
            detectedEncoding = 'utf-16be';
            offset = 2;
        } else if (uint8[0] === 0xFF && uint8[1] === 0xFE) {
            detectedEncoding = 'utf-16le';
            offset = 2;
        }
    }
    if (!detectedEncoding && uint8.length >= 3) {
        if (uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
            detectedEncoding = 'utf-8';
            offset = 3;
        }
    }

    if (detectedEncoding) {
        try {
            const decoder = new TextDecoder(detectedEncoding, { fatal: true });
            const view = new DataView(buffer, offset);
            const decodedText = decoder.decode(view);
            logger.log('ImportPipeline', 'INFO', `Arquivo '${file.name}' decodificado com sucesso usando a codificação '${detectedEncoding}' detectada pelo BOM.`);
            return decodedText.normalize('NFC');
        } catch (e) {
            logger.log('ImportPipeline', 'ERROR', `BOM detectou '${detectedEncoding}', mas a decodificação falhou para '${file.name}'. Tentando fallbacks.`, { error: e });
        }
    }

    const fallbackEncodings = ['utf-8', 'windows-1252', 'iso-8859-1'];
    for (const encoding of fallbackEncodings) {
        try {
            const decoder = new TextDecoder(encoding, { fatal: true });
            const decodedText = decoder.decode(buffer); 
            logger.log('ImportPipeline', 'INFO', `Arquivo '${file.name}' decodificado com sucesso usando o fallback '${encoding}'.`);
            return decodedText.normalize('NFC');
        } catch (e) {
            continue;
        }
    }
    
    logger.log('ImportPipeline', 'ERROR', `Falha ao decodificar '${file.name}' com todas as codificações tentadas.`);
    throw new Error(`Não foi possível decodificar o arquivo ${file.name}. A codificação de caracteres é desconhecida ou o arquivo está corrompido.`);
};


const getFileExtension = (filename: string): string => {
    return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2).toLowerCase();
};

const sanitizeFilename = (filename: string): string => {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

const getXmlValue = (field: any): any => {
    if (field === null || field === undefined) return undefined;
    if (typeof field === 'object') {
        if (field['#text'] !== undefined) return field['#text'];
        if (Object.keys(field).length === 0) return undefined;
    }
    return field;
};

const getInnerTaxBlock = (taxParent: any): any => {
    if (!taxParent || typeof taxParent !== 'object') {
        return {};
    }
    const keys = Object.keys(taxParent);
    if (keys.length > 0) {
        const innerKey = keys.find(k => typeof taxParent[k] === 'object' && taxParent[k] !== null);
        if (innerKey) {
            return taxParent[innerKey];
        }
    }
    return {};
};


const normalizeNFeData = (nfeData: any, fallbackId: string): Record<string, any>[] => {
    const infNFe = nfeData?.nfeProc?.NFe?.infNFe || nfeData?.NFe?.infNFe || nfeData?.infNFe;
    if (!infNFe) {
        logger.log('ImportPipeline', 'ERROR', 'Bloco <infNFe> não encontrado no XML. O documento não pode ser processado.');
        return [];
    }

    const maskCnpj = (cnpj: string | undefined): string | undefined => {
        if (!cnpj || cnpj.length < 14) return cnpj;
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
    
    const nfeId = getXmlValue(infNFe['@_Id']) || fallbackId;
    if (!infNFe['@_Id']) {
        logger.log('ImportPipeline', 'WARN', `Atributo "Id" da NFe não foi encontrado. Usando fallback: "${fallbackId}".`);
    }

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
        const icmsBlock = getInnerTaxBlock(imposto.ICMS);
        const pisBlock = getInnerTaxBlock(imposto.PIS);
        const cofinsBlock = getInnerTaxBlock(imposto.COFINS);
        const issqnBlock = imposto.ISSQN || {};
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

/**
 * [CORRIGIDO] Normaliza cabeçalhos e garante a presença de `nfe_id`.
 * Se 'nfe_id' não for encontrado como uma coluna, o nome do arquivo é usado como fallback.
 * @param data O array de objetos de dados com cabeçalhos já transformados (lowercase_underscore).
 * @param file O arquivo original, para fins de logging e fallback de ID.
 * @returns O array de objetos de dados com os cabeçalhos normalizados e `nfe_id` garantido.
 */
const normalizeHeadersToCanonical = (data: Record<string, any>[], file: { name: string }): Record<string, any>[] => {
    if (!data || data.length === 0) return [];

    const headerMapping: Record<string, string[]> = {
      'nfe_id': ['chave_de_acesso'],
      'data_emissao': ['data_emissão', 'data_de_emissão', 'data_emissao'],
      'valor_total_nfe': ['valor_total_da_nfe', 'valor_da_nota'],
      'emitente_nome': ['razão_social_emitente', 'nome_do_emitente'],
      'emitente_cnpj': ['cpf/cnpj_emitente', 'cnpj_do_emitente'],
      'emitente_uf': ['uf_emitente'],
      'destinatario_nome': ['nome_destinatário', 'nome_do_destinatario'],
      'destinatario_cnpj': ['cnpj_destinatário', 'cnpj_do_destinatario'],
      'destinatario_uf': ['uf_destinatário', 'uf_do_destinatario'],
      'produto_nome': ['descrição_do_produto/serviço', 'descrição_do_produto', 'nome_do_produto'],
      'produto_ncm': ['código_ncm/sh', 'ncm'],
      'produto_cfop': ['cfop'],
      'produto_qtd': ['quantidade'],
      'produto_valor_unit': ['valor_unitário'],
      'produto_valor_total': ['valor_total', 'valor_total_do_item'],
      'produto_valor_icms': ['valor_icms'],
      'produto_valor_pis': ['valor_pis'],
      'produto_valor_cofins': ['valor_cofins'],
      'produto_valor_iss': ['valor_iss'],
      'produto_cst_icms': ['cst_icms'],
      'produto_base_calculo_icms': ['base_de_calculo_icms'],
      'produto_aliquota_icms': ['aliquota_icms'],
      'produto_cst_pis': ['cst_pis'],
      'produto_cst_cofins': ['cst_cofins'],
    };

    const reverseMap = new Map<string, string>();
    for (const [canonical, variations] of Object.entries(headerMapping)) {
        for (const variation of variations) {
            reverseMap.set(variation, canonical);
            const simplifiedVariation = variation.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (simplifiedVariation !== variation) {
                reverseMap.set(simplifiedVariation, canonical);
            }
        }
    }
    
    const firstRowKeys = Object.keys(data[0]);
    const fiscalHeadersFound = firstRowKeys.filter(key => reverseMap.has(key) || reverseMap.has(key.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));

    if (fiscalHeadersFound.length >= 3) {
        logger.log('ImportPipeline', 'INFO', `Arquivo tabular fiscal detectado (${file.name}). Normalizando ${fiscalHeadersFound.length} cabeçalhos.`);
        
        const mappedData = data.map(row => {
            const normalizedRow: Record<string, any> = {};
            for (const [key, value] of Object.entries(row)) {
                 const simplifiedKey = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                 const canonicalKey = reverseMap.get(key) || reverseMap.get(simplifiedKey);
                if (canonicalKey) {
                    normalizedRow[canonicalKey] = value;
                } else {
                    normalizedRow[key] = value;
                }
            }
            return normalizedRow;
        });

        // **INÍCIO DA CORREÇÃO**
        // Garante que todo item tenha um nfe_id para o agente contador poder agrupar.
        const hasNfeIdColumn = mappedData.length > 0 && mappedData[0].hasOwnProperty('nfe_id');

        if (!hasNfeIdColumn) {
            logger.log('ImportPipeline', 'WARN', `A coluna 'nfe_id' (ou 'chave_de_acesso') não foi encontrada em ${file.name}. Usando o nome do arquivo como ID de fallback para todos os itens.`);
            // Injeta o nome do arquivo como nfe_id para cada linha.
            return mappedData.map(row => ({
                ...row,
                nfe_id: file.name
            }));
        }
        
        return mappedData;
        // **FIM DA CORREÇÃO**
    }
    
    logger.log('ImportPipeline', 'INFO', `Arquivo tabular (${file.name}) não parece ser um arquivo fiscal padrão, pulando normalização de cabeçalho.`);
    return data;
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
        const data = normalizeNFeData(jsonObj, file.name);

        if (data.length === 0) {
            return { kind: 'NFE_XML', name: file.name, size: file.size, status: 'error', error: 'Nenhum item de produto encontrado no XML ou XML malformado.', raw: file };
        }
        return { kind: 'NFE_XML', name: file.name, size: file.size, status: 'parsed', data, raw: file };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.log('ImportPipeline', 'ERROR', `Erro crítico ao processar XML: ${file.name}`, { error: error });
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
                transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
                complete: (results) => {
                    const data = results.data as Record<string, any>[];
                    const normalizedData = normalizeHeadersToCanonical(data, file);
                    resolve({ kind: 'CSV', name: file.name, size: file.size, status: 'parsed', data: normalizedData, raw: file });
                },
                error: (error: unknown) => {
                    const message = error instanceof Error ? error.message : String(error);
                    resolve({ kind: 'CSV', name: file.name, size: file.size, status: 'error', error: `Erro ao processar CSV: ${message}`, raw: file });
                },
            });
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
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
        
        const rawData = utils.sheet_to_json(worksheet, { defval: null }) as Record<string, any>[];
        if (rawData.length === 0) {
            return { kind: 'XLSX', name: file.name, size: file.size, status: 'parsed', data: [], raw: file };
        }

        const transformedData = rawData.map(row => {
            const newRow: Record<string, any> = {};
            for (const key in row) {
                newRow[key.trim().toLowerCase().replace(/\s+/g, '_')] = row[key];
            }
            return newRow;
        });

        const normalizedData = normalizeHeadersToCanonical(transformedData, file);
        return { kind: 'XLSX', name: file.name, size: file.size, status: 'parsed', data: normalizedData, raw: file };
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
        // **INÍCIO DA CORREÇÃO**
        // Injeta o nfe_id para garantir que o agente contador possa agrupar os dados.
        data.forEach(item => { item.nfe_id = file.name; });
        if (data.length > 0) {
            logger.log('ImportPipeline', 'INFO', `Injetado nfe_id a partir do nome do arquivo para dados extraídos de ${file.name}`);
        }
        // **FIM DA CORREÇÃO**
        return { kind: 'IMAGE', name: file.name, size: file.size, status: 'parsed', text, data, raw: file };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
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

        if (fullText.trim().length > 10) {
             const data = await extractDataFromText(fullText);
             if (data.length === 0) {
                logger.log('nlpAgent', 'WARN', `Nenhum dado estruturado extraído do texto do PDF ${file.name}`);
             }
             // **INÍCIO DA CORREÇÃO**
             data.forEach(item => { item.nfe_id = file.name; });
             if (data.length > 0) {
                logger.log('ImportPipeline', 'INFO', `Injetado nfe_id a partir do nome do arquivo para dados extraídos de ${file.name}`);
             }
             // **FIM DA CORREÇÃO**
             doc.data = data;
        } else {
            logger.log('ocrExtractor', 'INFO', `PDF ${file.name} sem texto, tentando OCR.`);
            const ocrText = await runOCRFromImage(buffer);
            if (!ocrText.trim()) {
                throw new Error("Documento PDF parece estar vazio ou não contém texto legível (falha no OCR).");
            }
            doc.text = ocrText;
            const ocrData = await extractDataFromText(ocrText);
            // **INÍCIO DA CORREÇÃO**
            ocrData.forEach(item => { item.nfe_id = file.name; });
            if (ocrData.length > 0) {
                logger.log('ImportPipeline', 'INFO', `Injetado nfe_id a partir do nome do arquivo para dados extraídos de ${file.name} (via OCR)`);
            }
            // **FIM DA CORREÇÃO**
            doc.data = ocrData;
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
                        
                        const notasDoc = innerDocs.find(d => d.name.toLowerCase().includes('notas') && d.kind === 'CSV' && d.status === 'parsed');
                        const itensDoc = innerDocs.find(d => d.name.toLowerCase().includes('itens') && d.kind === 'CSV' && d.status === 'parsed');

                        if (notasDoc && itensDoc && notasDoc.data && itensDoc.data) {
                            logger.log('ImportPipeline', 'INFO', `Detectado par de CSVs (notas/itens). Iniciando merge de dados.`);
                            
                            const notasData = notasDoc.data;
                            const itensData = itensDoc.data;
                            const otherDocs = innerDocs.filter(d => d !== notasDoc && d !== itensDoc);

                            const joinKey = 'nfe_id';

                            if (notasData.length > 0 && itensData.length > 0 && notasData[0][joinKey] && itensData[0][joinKey]) {
                                const notasMap = new Map<string, Record<string, any>>();
                                for (const nota of notasData) {
                                    notasMap.set(nota[joinKey], nota);
                                }

                                const mergedData = itensData.map(item => {
                                    const notaHeader = notasMap.get(item[joinKey]);
                                    return notaHeader ? { ...notaHeader, ...item } : item;
                                });
                                
                                const finalMergedData = normalizeHeadersToCanonical(mergedData, { name: `${notasDoc.name} + ${itensDoc.name}`});

                                const mergedDoc: ImportedDoc = {
                                    kind: 'CSV', name: file.name, size: file.size, status: 'parsed', data: finalMergedData, raw: file,
                                    meta: { source_zip: file.name, internal_path: `${notasDoc.name} + ${itensDoc.name}` }
                                };
                                
                                result = [mergedDoc, ...otherDocs];
                                logger.log('ImportPipeline', 'INFO', `Merge de ${mergedData.length} itens concluído.`);

                            } else {
                                logger.log('ImportPipeline', 'WARN', `Falha no merge de CSVs: chave de junção '${joinKey}' não encontrada. Processando individualmente.`);
                                result = innerDocs;
                            }
                        } else {
                            result = innerDocs;
                        }
                        logger.log('ImportPipeline', 'INFO', `Processados ${Array.isArray(result) ? result.length : 1} documento(s) de dentro de ${file.name}`);
                    }
            
                } catch (e: unknown) {
                    const message = e instanceof Error ? e.message : String(e);
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
