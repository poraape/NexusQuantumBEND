import type { ImportedDoc, BankTransaction } from '../types';
import { runOCRFromImage } from '../agents/ocrExtractor';
import { extractDataFromText } from '../agents/nlpAgent';
import { logger } from '../services/logger';
import { parseSafeFloat } from './parsingUtils';
import dayjs from 'dayjs';

import JSZip, { type JSZipObject } from 'jszip';
import Papa from 'papaparse';

// Set up PDF.js worker using assets empacotados localmente pelo bundler
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;


// --- Helper Functions ---

const readFileAsBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
};

const decodeBuffer = (buffer: ArrayBuffer, encoding: string): string => {
    const decoder = new TextDecoder(encoding, { fatal: true });
    return decoder.decode(buffer);
};

const getFileExtension = (filename: string): string => {
    return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase();
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

const normalizeHeadersToCanonical = (data: Record<string, any>[], file: { name: string }): Record<string, any>[] => {
    if (!data || data.length === 0) return [];

    // Massively expanded header mapping for robustness
    const headerMapping: Record<string, string[]> = {
        'nfe_id': ['chave de acesso', 'chave_de_acesso', 'chavedeacesso', 'chave', 'numeronf', 'numero da nf', 'nfe', 'chave nfe', 'série', 'sã©rie', 'numero nota fiscal'],
        'data_emissao': ['data emissão', 'data_emissão', 'data de emissão', 'data_de_emissão', 'dataemissao', 'dtemissao', 'dh emi', 'dhemi'],
        'valor_total_nfe': ['valor total da operação', 'valor_total_da_nfe', 'valor da nota', 'valor_da_nota', 'valortotalnota', 'vlr total nf', 'valor total nf-e', 'vnf', 'valor nota fiscal'],
        'emitente_nome': ['razão social emitente', 'razao social emitente', 'razaosocialemitente', 'nome do emitente', 'nome_do_emitente', 'emitente', 'emitente - razão social'],
        'emitente_cnpj': ['cpf/cnpj emitente', 'cnpj emitente', 'cnpj_emitente', 'cnpjemitente', 'cnpjemit', 'emitente - cnpj'],
        'emitente_uf': ['uf emitente', 'uf_emitente', 'ufemitente', 'emitente - uf'],
        'destinatario_nome': ['nome destinatário', 'nome_destinatário', 'nome do destinatario', 'nome_do_destinatario', 'destinatario', 'destinatário - nome/razão social'],
        'destinatario_cnpj': ['cnpj destinatário', 'cnpj_destinatário', 'cnpj do destinatario', 'cnpj_do_destinatario', 'destinatário - cnpj/cpf'],
        'destinatario_uf': ['uf destinatário', 'uf_destinatário', 'uf do destinatario', 'uf_do_destinatario', 'destinatário - uf'],
        'produto_nome': ['descrição do produto/serviço', 'descrição do produto', 'descricaoproduto', 'nome do produto', 'nome_do_produto', 'produto', 'desc', 'descricao', 'descriã§ã£o do produto/serviã§o', 'descrição do produto/serviã§o', 'descricaoproduto'],
        'produto_ncm': ['código ncm/sh', 'ncm/sh (tipo de produto)', 'ncm', 'codigo ncm'],
        'produto_cfop': ['cfop'],
        'produto_qtd': ['quantidade', 'qtd', 'qtde', 'qtd.', 'qcom'],
        'produto_valor_unit': ['valor unitário', 'valor_unitário', 'valorunitario', 'vlr_unit', 'valor unitã¡rio', 'vuncom'],
        'produto_valor_total': ['valor total', 'valortotal', 'valortotalitem', 'vlr_total', 'vprod'],
        'produto_valor_icms': ['valor icms', 'valor_icms', 'icms', 'vlr_icms', 'valor do icms', 'valor_do_icms', 'vicms'],
        'produto_valor_pis': ['valor pis', 'valor_pis', 'pis', 'vlr_pis', 'valor do pis', 'valor_do_pis', 'vpis'],
        'produto_valor_cofins': ['valor cofins', 'valor_cofins', 'cofins', 'vlr_cofins', 'valor da cofins', 'valor_da_cofins', 'vcofins'],
        'produto_valor_iss': ['valor iss', 'valor_iss', 'iss', 'vlr_iss', 'valor do iss', 'valor_do_iss', 'vissqn'],
        'produto_cst_icms': ['cst icms', 'cst_icms', 'cst'],
        'produto_base_calculo_icms': ['base de calculo icms', 'base_de_calculo_icms', 'bc icms', 'vbc'],
        'produto_aliquota_icms': ['aliquota icms', 'aliquota_icms', 'aliq icms', 'picms'],
        'produto_cst_pis': ['cst pis', 'cst_pis'],
        'produto_cst_cofins': ['cst cofins', 'cst_cofins'],
        'natureza_operacao': ['natureza da operação', 'natureza da operacao', 'natop', 'natureza da operaã§ã£o'],
    };


    const reverseMap = new Map<string, string>();
    for (const [canonical, variations] of Object.entries(headerMapping)) {
        for (const variation of variations) {
            reverseMap.set(variation, canonical);
            // Also map simplified versions without accents or special chars
            const simplifiedVariation = variation
                .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove accents
                .replace(/[^a-z0-9]/gi, ''); // remove non-alphanumeric
            if (simplifiedVariation !== variation) {
                reverseMap.set(simplifiedVariation, canonical);
            }
        }
    }
    
    const mappedData = data.map(row => {
        const normalizedRow: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
            if (key.toLowerCase().startsWith('unnamed')) {
                continue; // Skip 'Unnamed' columns generated by some parsers
            }
             const simplifiedKey = key
                .normalize("NFD").replace(/[̀-ͯ]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]/gi, '');
             const canonicalKey = reverseMap.get(key.toLowerCase().trim()) || reverseMap.get(simplifiedKey);
            if (canonicalKey) {
                normalizedRow[canonicalKey] = value;
            } else {
                normalizedRow[key] = value; // Keep original if no mapping found
            }
        }
        return normalizedRow;
    });

    const hasNfeIdColumn = mappedData.length > 0 && mappedData[0].hasOwnProperty('nfe_id');
    const hasValidNfeIdValues = hasNfeIdColumn && mappedData.some(row => row.nfe_id && String(row.nfe_id).trim() !== '');
    const hasFiscalData = mappedData.some(row => row.produto_valor_total || row.valor_total_nfe || row.produto_cfop);
    
    if (!hasValidNfeIdValues && hasFiscalData) {
        if (hasNfeIdColumn) {
            logger.log('ImportPipeline', 'WARN', `A coluna 'nfe_id' foi encontrada em ${file.name}, mas não contém valores válidos. Usando o nome do arquivo como ID de fallback.`);
        } else {
            logger.log('ImportPipeline', 'WARN', `A coluna 'nfe_id' (ou variações) não foi encontrada em ${file.name}. Usando o nome do arquivo como ID de fallback.`);
        }
        
        return mappedData.map(row => ({
            ...row,
            nfe_id: file.name
        }));
    }
    
    return mappedData;
};

// --- Individual File Handlers ---

const handleXML = async (file: File): Promise<ImportedDoc> => {
    try {
        const { XMLParser } = await import('fast-xml-parser');
        const buffer = await readFileAsBuffer(file);
        const text = new TextDecoder('utf-8').decode(buffer);
        
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
        logger.log('ImportPipeline', 'ERROR', `Erro crítico ao processar XML: ${file.name}`, { error });
        return { kind: 'NFE_XML', name: file.name, size: file.size, status: 'error', error: `Erro ao processar XML: ${message}`, raw: file };
    }
};

const validateParsedData = (data: Record<string, any>[], config: ParsingConfig): boolean => {
    if (!data || data.length === 0) {
        logger.log('ImportPipeline', 'REJECT', `Config ${JSON.stringify(config)} rejeitada: Nenhum dado encontrado.`);
        return false;
    }

    const numericFields = [
        'produto_valor_total', 'valor_total_nfe', 'produto_qtd', 'produto_valor_unit',
        'produto_valor_icms', 'produto_valor_pis', 'produto_valor_cofins', 'produto_valor_iss',
        'produto_base_calculo_icms'
    ];

    const headers = Object.keys(data[0]);
    const headersEncontrados = headers.filter(header => numericFields.includes(header));

    if (headersEncontrados.length === 0) {
        logger.log('ImportPipeline', 'REJECT', `Config ${JSON.stringify(config)} rejeitada: Nenhuma coluna numérica canônica encontrada.`, { headers: headers.slice(0, 10) });
        return false;
    }

    let nValidos = 0;
    const amostraValores: Record<string, number[]> = {};
    headersEncontrados.forEach(field => amostraValores[field] = []);

    for (const row of data) {
        for (const field of headersEncontrados) {
            const value = parseSafeFloat(row[field]);
            if (!Number.isNaN(value)) {
                nValidos++;
                if (amostraValores[field].length < 5) {
                    amostraValores[field].push(value);
                }
            }
        }
    }

    const K = Math.max(3, Math.floor(data.length * 0.01));
    const hasEnoughData = nValidos >= K;

    logger.log('ImportPipeline', 'INFO', 'Estatísticas de validação de dados.', {
        config,
        headersEncontrados,
        nLinhas: data.length,
        nColunas: headers.length,
        nValidos,
        amostraValores,
        K,
        hasEnoughData
    });

    if (!hasEnoughData) {
        logger.log('ImportPipeline', 'REJECT', `Config ${JSON.stringify(config)} rejeitada: Número de valores numéricos válidos (${nValidos}) é menor que o limiar K (${K}).`);
    }

    return hasEnoughData;
};

type ParsingConfig = {
    encoding: string;
    delimiter: string;
    preProcess?: (text: string) => string;
};

const contextualParsingProfiles: { context: string; filePattern: RegExp; config: ParsingConfig }[] = [
    { context: '202401_NFs', filePattern: /202401_NFs/i, config: { encoding: 'utf-8', delimiter: ',' } },
    { context: 'Codificados-Notas', filePattern: /notas_utf8\.csv/i, config: { encoding: 'utf-8', delimiter: ';' } },
    { context: 'Codificados-Itens', filePattern: /itens_iso8859_1\.csv/i, config: { encoding: 'iso-8859-1', delimiter: ';' } },
    // Regex for nf_dataset/notas.csv and nf_dataset/itens.csv specifically
    { context: 'NFDataset', filePattern: /^(notas|itens)\.csv$/i, config: { encoding: 'utf-8', delimiter: '|', preProcess: (text: string) => text.replace(/;;/g, '|') } },
];

const generalFallbackConfigs: ParsingConfig[] = [
    { encoding: 'utf-8', delimiter: ';' },
    { encoding: 'utf-8', delimiter: ',' },
    { encoding: 'windows-1252', delimiter: ';' },
    { encoding: 'windows-1252', delimiter: ',' },
    { encoding: 'iso-8859-1', delimiter: ';' },
    { encoding: 'iso-8859-1', delimiter: ',' },
    { encoding: 'utf-16le', delimiter: '\t' },
    { encoding: 'utf-8', delimiter: '|' },
    { encoding: 'utf-8', delimiter: '\t' }
];


const handleCSV = async (file: File): Promise<ImportedDoc> => {
    const buffer = await readFileAsBuffer(file);
    let configsToTry: ParsingConfig[] = [];

    // Heuristic for delimiter
    const textSample = new TextDecoder('utf-8').decode(buffer.slice(0, 2048));
    const lines = textSample.split('\n').slice(0, 10);
    
    if (lines.length > 1) {
        const delimiters = [';', ',', '\t', '|'];
        const stats = delimiters.map(delimiter => {
            const counts = lines.map(line => line.split(delimiter).length - 1);
            const firstCount = counts[0];
            if (firstCount === 0) return { delimiter, consistent: false, count: 0 };
            const isConsistent = counts.every(count => count === firstCount);
            return { delimiter, consistent: isConsistent, count: firstCount };
        });

        const consistentDelimiters = stats.filter(s => s.consistent && s.count > 0);
        if (consistentDelimiters.length > 0) {
            const detectedDelimiter = consistentDelimiters.sort((a, b) => b.count - a.count)[0].delimiter;
            logger.log('ImportPipeline', 'INFO', `Heurística detectou o delimitador: '${detectedDelimiter}'`);
            
            configsToTry.push({ encoding: 'utf-8', delimiter: detectedDelimiter });
            configsToTry.push({ encoding: 'windows-1252', delimiter: detectedDelimiter });
        }
    }


    const matchedProfile = contextualParsingProfiles.find(p => p.filePattern.test(file.name));
    if (matchedProfile) {
        logger.log('ImportPipeline', 'INFO', `Perfil de parsing contextual ('${matchedProfile.context}') encontrado para ${file.name}. Adicionando à lista de tentativas.`);
        configsToTry.push(matchedProfile.config);
    }
    
    configsToTry.push(...generalFallbackConfigs);
    configsToTry = [...new Map(configsToTry.map(item => [JSON.stringify(item), item])).values()];

    const numericFields = [
        'produto_valor_total', 'valor_total_nfe', 'produto_qtd', 'produto_valor_unit',
        'produto_valor_icms', 'produto_valor_pis', 'produto_valor_cofins', 'produto_valor_iss',
        'produto_base_calculo_icms'
    ];

    for (const config of configsToTry) {
        try {
            let text = decodeBuffer(buffer, config.encoding);

            if (config.preProcess) {
                text = config.preProcess(text);
            }
            
            const results = Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                delimiter: config.delimiter,
                transformHeader: (h) => h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '_'),
            });
            
            let data = results.data as Record<string, any>[];
            
            const normalizedData = normalizeHeadersToCanonical(data, file);

            // Apply parseSafeFloat to all numeric fields after normalization
            const processedData = normalizedData.map(row => {
                const newRow = { ...row };
                for (const field of numericFields) {
                    if (newRow[field] !== undefined && typeof newRow[field] === 'string') {
                        newRow[field] = parseSafeFloat(newRow[field]);
                    }
                }
                return newRow;
            });

            if (validateParsedData(processedData, config)) {
                logger.log('ImportPipeline', 'INFO', `Validação bem-sucedida para ${file.name} com config ${JSON.stringify({encoding: config.encoding, delimiter: config.delimiter})}.`);
                return { kind: 'CSV', name: file.name, size: file.size, status: 'parsed', data: processedData, raw: file };
            }
        } catch (e) {
            logger.log('ImportPipeline', 'WARN', `Falha ao decodificar/parsear ${file.name} com config ${JSON.stringify(config)}`, { error: e instanceof Error ? e.message : e });
        }
    }
    
    const errorMessage = 'Não foi possível ler o arquivo CSV. Todas as tentativas de codificação e delimitador falharam em produzir dados válidos.';
    logger.log('ImportPipeline', 'ERROR', errorMessage, { file: file.name });
    return { kind: 'CSV', name: file.name, size: file.size, status: 'error', error: errorMessage, raw: file };
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

        const normalizedData = normalizeHeadersToCanonical(rawData, file);
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
        
        const dataWithId = data.map(item => ({ ...item, nfe_id: file.name }));
        if (data.length > 0) {
            logger.log('ImportPipeline', 'INFO', `Injetado nfe_id a partir do nome do arquivo para dados extraídos de ${file.name}`);
        }
        return { kind: 'IMAGE', name: file.name, size: file.size, status: 'parsed', text, data: dataWithId, raw: file };
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
             const dataWithId = data.map(item => ({...item, nfe_id: file.name }));
             if (data.length > 0) {
                logger.log('ImportPipeline', 'INFO', `Injetado nfe_id a partir do nome do arquivo para dados extraídos de ${file.name}`);
             }
             doc.data = dataWithId;
        } else {
            logger.log('ocrExtractor', 'INFO', `PDF ${file.name} sem texto, tentando OCR.`);
            const ocrText = await runOCRFromImage(buffer);
            if (!ocrText.trim()) {
                throw new Error("Documento PDF parece estar vazio ou não contém texto legível (falha no OCR).");
            }
            doc.text = ocrText;
            const ocrData = await extractDataFromText(ocrText);
            const ocrDataWithId = ocrData.map(item => ({...item, nfe_id: file.name }));
            if (ocrData.length > 0) {
                logger.log('ImportPipeline', 'INFO', `Injetado nfe_id a partir do nome do arquivo para dados extraídos de ${file.name} (via OCR)`);
            }
            doc.data = ocrDataWithId;
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
                            
                            const notasData = normalizeHeadersToCanonical(notasDoc.data, notasDoc);
                            const itensData = normalizeHeadersToCanonical(itensDoc.data, itensDoc);
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

                                const mergedDoc: ImportedDoc = {
                                    kind: 'CSV', name: file.name, size: file.size, status: 'parsed', data: mergedData, raw: file,
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
// FIX: Added the missing `importBankFiles` function to handle bank statement processing, resolving the import error.
export const importBankFiles = async (files: File[]): Promise<BankTransaction[]> => {
    logger.log('ImportPipeline', 'INFO', `Importando ${files.length} arquivo(s) de extrato bancário.`);
    const allTransactions: BankTransaction[] = [];

    for (const file of files) {
        const extension = getFileExtension(file.name);
        
        if (extension === 'csv') {
            try {
                const text = await file.text();
                const results = Papa.parse(text, {
                    header: true,
                    skipEmptyLines: true,
                });

                if (results.errors.length > 0) {
                    logger.log('ImportPipeline', 'WARN', `Erros ao parsear CSV de banco: ${file.name}`, { errors: results.errors.slice(0, 5) });
                }

                for (const row of results.data as any[]) {
                    // Heuristic to map common bank statement headers
                    const date = row.Date || row.date || row.Data || row.data;
                    const description = row.Description || row.description || row.Descrição || row.descrição || row.Historico || row.historico;
                    let amount = row.Amount || row.amount || row.Valor || row.valor;
                    const debit = row.Debit || row.debit || row.Débito || row.débito;
                    const credit = row.Credit || row.credit || row.Crédito || row.crédito;

                    if (!date || !description) continue;

                    let finalAmount = 0;
                    if (amount !== undefined) {
                        finalAmount = parseSafeFloat(amount);
                    } else if (debit !== undefined || credit !== undefined) {
                        finalAmount = parseSafeFloat(credit) - parseSafeFloat(debit);
                    } else {
                        continue; // Not enough data
                    }
                    
                    if (finalAmount === 0) continue;

                    allTransactions.push({
                        id: `${file.name}-${allTransactions.length}`,
                        date: dayjs(date, ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY/MM/DD", "DD-MM-YYYY"]).format('YYYY-MM-DD'),
                        amount: finalAmount,
                        description: description.toString(),
                        type: finalAmount > 0 ? 'CREDIT' : 'DEBIT',
                        sourceFile: file.name,
                    });
                }

            } catch (e) {
                 logger.log('ImportPipeline', 'ERROR', `Falha ao ler arquivo CSV de banco: ${file.name}`, { error: e });
            }
        } else if (extension === 'ofx') {
            // OFX parsing is complex and would require a library.
            // For now, we'll log a warning and skip.
            logger.log('ImportPipeline', 'WARN', `O parsing de arquivos OFX ('${file.name}') não é suportado nesta versão.`);
        }
    }
    
    logger.log('ImportPipeline', 'INFO', `Extraídas ${allTransactions.length} transações bancárias.`);
    return allTransactions;
};
