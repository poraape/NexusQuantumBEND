import { Type } from "@google/genai";
import type { AnalysisResult, AuditReport, AccountingEntry, AuditedDocument, SpedFile, KeyMetric } from '../types';
import { logger } from "../services/logger";
import { parseSafeFloat } from "../utils/parsingUtils";
import { generateJSON } from "../services/geminiService";

const analysisResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    summary: { type: Type.STRING },
    keyMetrics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          metric: { type: Type.STRING },
          value: { type: Type.STRING },
          insight: { type: Type.STRING, nullable: true },
          status: { type: Type.STRING, enum: ['OK', 'PARTIAL', 'UNAVAILABLE', 'ALERT'] },
          explanation: { type: Type.STRING, nullable: true }
        },
        required: ['metric', 'value', 'status'],
      },
    },
    actionableInsights: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    strategicRecommendations: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Recomendações estratégicas de alto nível para o negócio.'
    }
  },
  required: ['title', 'summary', 'keyMetrics', 'actionableInsights', 'strategicRecommendations'],
};

const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MOCK_ALIQUOTAS = {
    IVA: 0.25, // 25% (simulado)
};

type AggregatedMetrics = Record<string, KeyMetric>;


/**
 * Executa a agregação contábil determinística de forma contextual.
 * Esta função agrupa itens por NFe, reconstrói os totais e qualifica
 * cada métrica com um status (OK, ALERT, UNAVAILABLE) e uma explicação,
 * garantindo que a análise reflita a qualidade real dos dados.
 * @param report O relatório de auditoria contendo todos os documentos processados.
 * @returns Um registro de métricas agregadas enriquecidas.
 */
const runDeterministicAccounting = (report: Omit<AuditReport, 'summary'>): AggregatedMetrics => {
    const validDocs = report.documents.filter(d => d.status !== 'ERRO' && d.doc.data && d.doc.data.length > 0);
    const metrics: AggregatedMetrics = {};
    
    if (validDocs.length === 0) {
        metrics['Número de Documentos Válidos'] = { metric: 'Número de Documentos Válidos', value: '0', status: 'ALERT', explanation: 'Nenhum documento com dados válidos foi encontrado para processamento.' };
        return metrics;
    }

    const allItems = validDocs.flatMap(d => d.doc.data!);
    
    const nfeAggregates = new Map<string, {
        totalProductValue: number; totalICMS: number; totalPIS: number; totalCOFINS: number; totalISS: number; officialNfeTotal: number;
    }>();

    for (const item of allItems) {
        const nfeId = item.nfe_id;
        if (!nfeId) continue;
        if (!nfeAggregates.has(nfeId)) {
            nfeAggregates.set(nfeId, { totalProductValue: 0, totalICMS: 0, totalPIS: 0, totalCOFINS: 0, totalISS: 0, officialNfeTotal: 0 });
        }
        const currentNfe = nfeAggregates.get(nfeId)!;
        currentNfe.totalProductValue += parseSafeFloat(item.produto_valor_total);
        currentNfe.totalICMS += parseSafeFloat(item.produto_valor_icms);
        currentNfe.totalPIS += parseSafeFloat(item.produto_valor_pis);
        currentNfe.totalCOFINS += parseSafeFloat(item.produto_valor_cofins);
        currentNfe.totalISS += parseSafeFloat(item.produto_valor_iss);
        if (currentNfe.officialNfeTotal === 0) currentNfe.officialNfeTotal = parseSafeFloat(item.valor_total_nfe);
    }

    let grandTotalNfeValue = 0, grandTotalProductValue = 0, grandTotalICMS = 0, grandTotalPIS = 0, grandTotalCOFINS = 0, grandTotalISS = 0;
    for (const nfe of nfeAggregates.values()) {
        const reconstructedTotal = nfe.totalProductValue + nfe.totalICMS + nfe.totalPIS + nfe.totalCOFINS + nfe.totalISS;
        grandTotalNfeValue += (nfe.officialNfeTotal > 0 && Math.abs(nfe.officialNfeTotal - reconstructedTotal) < 0.02) ? nfe.officialNfeTotal : reconstructedTotal;
        grandTotalProductValue += nfe.totalProductValue;
        grandTotalICMS += nfe.totalICMS;
        grandTotalPIS += nfe.totalPIS;
        grandTotalCOFINS += nfe.totalCOFINS;
        grandTotalISS += nfe.totalISS;
    }

    metrics['Número de Documentos Válidos'] = { metric: 'Número de Documentos Válidos', value: nfeAggregates.size.toString(), status: 'OK', explanation: `${nfeAggregates.size} documentos com ${allItems.length} itens válidos foram processados.` };
    metrics['Total de Itens Processados'] = { metric: 'Total de Itens Processados', value: allItems.length.toString(), status: 'OK', explanation: `Soma de todos os itens de produtos/serviços encontrados nos documentos válidos.` };
    metrics['Valor Total das NFes'] = { metric: 'Valor Total das NFes', value: formatCurrency(grandTotalNfeValue), status: grandTotalNfeValue > 0 ? 'OK' : 'ALERT', explanation: grandTotalNfeValue > 0 ? `Soma dos valores totais de ${nfeAggregates.size} NFe(s).` : 'O valor total das NFes é zero. Verifique se os valores nos documentos de origem estão corretos.' };
    metrics['Valor Total dos Produtos'] = { metric: 'Valor Total dos Produtos', value: formatCurrency(grandTotalProductValue), status: grandTotalProductValue > 0 ? 'OK' : 'ALERT', explanation: 'Soma de todos os itens de produtos. Um valor zero pode indicar que apenas serviços foram processados ou há um problema nos dados.' };
    
    const createTaxMetric = (name: string, totalValue: number, taxName: string, fieldName: string): KeyMetric => {
        const itemsWithTax = allItems.filter(i => parseSafeFloat(i[fieldName]) !== 0).length;
        if (itemsWithTax > 0) {
            return { metric: name, value: formatCurrency(totalValue), status: 'OK', explanation: `Soma do ${taxName} encontrado em ${itemsWithTax} item(ns).` };
        }
        return { metric: name, value: formatCurrency(0), status: 'UNAVAILABLE', explanation: `Nenhum item com valor de ${taxName} foi detectado nos documentos.` };
    };

    metrics['Valor Total de ICMS'] = createTaxMetric('Valor Total de ICMS', grandTotalICMS, 'ICMS', 'produto_valor_icms');
    metrics['Valor Total de PIS'] = createTaxMetric('Valor Total de PIS', grandTotalPIS, 'PIS', 'produto_valor_pis');
    metrics['Valor Total de COFINS'] = createTaxMetric('Valor Total de COFINS', grandTotalCOFINS, 'COFINS', 'produto_valor_cofins');
    metrics['Valor Total de ISS'] = createTaxMetric('Valor Total de ISS', grandTotalISS, 'ISS', 'produto_valor_iss');

    const ivaBase = grandTotalPIS + grandTotalCOFINS;
    metrics['Estimativa de IVA (Simulado)'] = { metric: 'Estimativa de IVA (Simulado)', value: formatCurrency(ivaBase * MOCK_ALIQUOTAS.IVA), status: ivaBase > 0 ? 'OK' : 'UNAVAILABLE', explanation: `Simulação de ${MOCK_ALIQUOTAS.IVA * 100}% sobre a base de PIS/COFINS de ${formatCurrency(ivaBase)}. Não representa um valor fiscal real.` };

    return metrics;
}

const runAIAccountingSummary = async (dataSample: string, aggregatedMetrics: AggregatedMetrics): Promise<AnalysisResult> => {
  const prompt = `
        You are an expert financial analyst. I have performed a preliminary, deterministic analysis on a batch of fiscal documents and derived the following key aggregated metrics, each with a status indicating data quality:
        ---
        Aggregated Metrics (Source of truth with status and explanations):
        ${JSON.stringify(aggregatedMetrics, null, 2)}
        ---
        I also have a small, representative sample of the line-item data from these documents in CSV format:
        ---
        Data Sample:
        ${dataSample}
        ---

        Your task is to act as the final step in the analysis pipeline.
        1.  Create a compelling, professional 'title' for this analysis report.
        2.  Write a concise 'summary' of the fiscal situation based on both the aggregated metrics and the data sample. Address any metrics with 'ALERT' or 'UNAVAILABLE' status in your summary.
        3.  Populate the 'keyMetrics' array. You MUST use the pre-calculated aggregated metrics. For each metric, transfer its 'metric', 'value', 'status', and 'explanation'. Then, using your analytical skill, write a concise and relevant 'insight' for each one, especially for metrics with 'ALERT' or 'UNAVAILABLE' status. The insight should be a human-friendly interpretation of the status and value.
        4.  Generate 2-3 insightful, 'actionableInsights' for a business manager. If there are metrics with 'ALERT' status, you MUST include an insight addressing it directly.
        5.  Based on everything, provide 1-2 'strategicRecommendations' for the business. These should be higher-level than the actionable insights, focusing on long-term strategy.

        The entire response must be in Brazilian Portuguese and formatted as a single JSON object adhering to the required schema. Ensure any double quotes inside JSON string values are properly escaped (e.g., "insight sobre \\"produto X\\""). Do not include any text outside of the JSON object.
    `;
  
  return generateJSON<AnalysisResult>(
    'gemini-2.5-flash',
    prompt,
    analysisResponseSchema
  );
};

const generateAccountingEntries = (documents: AuditedDocument[]): AccountingEntry[] => {
    const entries: AccountingEntry[] = [];
    
    for (const doc of documents) {
        if (doc.status === 'ERRO' || !doc.classification || !doc.doc.data || doc.doc.data.length === 0) continue;
        
        const totalNfe = parseSafeFloat(doc.doc.data[0]?.valor_total_nfe);
        const totalProducts = doc.doc.data.reduce((sum, item) => sum + parseSafeFloat(item.produto_valor_total), 0);
        const totalIcms = doc.doc.data.reduce((sum, item) => sum + parseSafeFloat(item.produto_valor_icms), 0);
        
        if (totalNfe === 0 && totalProducts === 0) continue; // Skip docs with no values

        switch (doc.classification.operationType) {
            case 'Compra':
                entries.push({ docName: doc.doc.name, account: '1.1.2 Estoques', type: 'D', value: totalProducts });
                if (totalIcms > 0) {
                    entries.push({ docName: doc.doc.name, account: '1.2.1 ICMS a Recuperar', type: 'D', value: totalIcms });
                }
                entries.push({ docName: doc.doc.name, account: '2.1.1 Fornecedores', type: 'C', value: totalNfe });
                break;
            case 'Venda':
                entries.push({ docName: doc.doc.name, account: '1.1.3 Clientes', type: 'D', value: totalNfe });
                entries.push({ docName: doc.doc.name, account: '4.1.1 Receita de Vendas', type: 'C', value: totalProducts });
                if (totalIcms > 0) {
                     entries.push({ docName: doc.doc.name, account: '4.2.1 ICMS sobre Vendas', type: 'D', value: totalIcms });
                     entries.push({ docName: doc.doc.name, account: '2.1.2 ICMS a Recolher', type: 'C', value: totalIcms });
                }
                break;
            case 'Devolução':
                const firstCfopDev = doc.doc.data[0]?.produto_cfop?.toString();
                if (firstCfopDev?.startsWith('1') || firstCfopDev?.startsWith('2')) { // Devolução de Compra
                    entries.push({ docName: doc.doc.name, account: '2.1.1 Fornecedores', type: 'D', value: totalNfe });
                    if (totalIcms > 0) {
                        entries.push({ docName: doc.doc.name, account: '1.2.1 ICMS a Recuperar', type: 'C', value: totalIcms });
                    }
                    entries.push({ docName: doc.doc.name, account: '1.1.2 Estoques', type: 'C', value: totalProducts });
                } else if (firstCfopDev?.startsWith('5') || firstCfopDev?.startsWith('6')) { // Devolução de Venda
                    entries.push({ docName: doc.doc.name, account: '4.1.2 Devoluções de Vendas', type: 'D', value: totalProducts });
                    if (totalIcms > 0) {
                        entries.push({ docName: doc.doc.name, account: '2.1.2 ICMS a Recolher', type: 'D', value: totalIcms });
                    }
                    entries.push({ docName: doc.doc.name, account: '1.1.3 Clientes', type: 'C', value: totalNfe });
                }
                break;
            case 'Serviço':
                const firstCfopServ = doc.doc.data[0]?.produto_cfop?.toString();
                 if (firstCfopServ?.startsWith('5') || firstCfopServ?.startsWith('6') || firstCfopServ?.startsWith('7')) { // Serviço Prestado
                    entries.push({ docName: doc.doc.name, account: '1.1.3 Clientes', type: 'D', value: totalNfe });
                    entries.push({ docName: doc.doc.name, account: '4.1.3 Receita de Serviços', type: 'C', value: totalNfe });
                } else { // Serviço Tomado (compra)
                    entries.push({ docName: doc.doc.name, account: '3.1.1 Despesa com Serviços', type: 'D', value: totalNfe });
                    entries.push({ docName: doc.doc.name, account: '2.1.1 Fornecedores', type: 'C', value: totalNfe });
                }
                break;
            case 'Transferência':
                const firstCfopTransf = doc.doc.data[0]?.produto_cfop?.toString();
                if (firstCfopTransf?.startsWith('5') || firstCfopTransf?.startsWith('6')) { // Transferência de saída
                    entries.push({ docName: doc.doc.name, account: '3.1.2 Custo de Transferência', type: 'D', value: totalProducts });
                    entries.push({ docName: doc.doc.name, account: '1.1.2 Estoques', type: 'C', value: totalProducts });
                } else { // Transferência de entrada
                    entries.push({ docName: doc.doc.name, account: '1.1.2 Estoques', type: 'D', value: totalProducts });
                    entries.push({ docName: doc.doc.name, account: '4.1.4 Receita de Transferência', type: 'C', value: totalProducts });
                }
                break;
        }
    }
    return entries;
};

const generateSpedEfd = (report: Pick<AuditReport, 'documents'>): SpedFile => {
    const lines: string[] = [];
    const today = new Date();
    const dataIni = new Date(today.getFullYear(), today.getMonth(), 1).toLocaleDateString('pt-BR').replace(/\//g, '');
    const dataFim = new Date(today.getFullYear(), today.getMonth() + 1, 0).toLocaleDateString('pt-BR').replace(/\//g, '');

    const recordCounts: Record<string, number> = {};
    const countRecord = (type: string) => { recordCounts[type] = (recordCounts[type] || 0) + 1; };

    // Bloco 0
    lines.push(`|0000|017|0|${dataIni}|${dataFim}|Nexus QuantumI2A2|12345678000195||SP|||A|1|`);
    countRecord('0000');
    lines.push('|0001|0|');
    countRecord('0001');

    // Bloco C
    lines.push('|C001|0|');
    countRecord('C001');
    const validDocs = report.documents.filter(d => d.status !== 'ERRO' && d.doc.data && d.doc.data.length > 0);
    
    for(const doc of validDocs) {
        const firstItem = doc.doc.data![0];
        lines.push(`|C100|${doc.classification?.operationType === 'Compra' ? '0' : '1'}|0||55|||${parseSafeFloat(firstItem.valor_total_nfe).toFixed(2).replace('.',',')}||||||||`);
        countRecord('C100');

        const c190Aggregator: Record<string, { vBC: number, vIcms: number, vOper: number }> = {};
        
        doc.doc.data?.forEach((item) => {
            const cst = (item.produto_cst_icms?.toString() || '00').slice(0, 3);
            const cfop = item.produto_cfop?.toString() || '0000';
            const aliq = (item.produto_aliquota_icms || 0).toFixed(2).replace('.',',');
            const key = `${cst}|${cfop}|${aliq}`;

            if (!c190Aggregator[key]) {
                c190Aggregator[key] = { vBC: 0, vIcms: 0, vOper: 0 };
            }
            c190Aggregator[key].vBC += parseSafeFloat(item.produto_base_calculo_icms);
            c190Aggregator[key].vIcms += parseSafeFloat(item.produto_valor_icms);
            c190Aggregator[key].vOper += parseSafeFloat(item.produto_valor_total);
        });

        Object.entries(c190Aggregator).forEach(([key, values]) => {
            const [cst, cfop, aliq] = key.split('|');
            lines.push(`|C190|${cst}|${cfop}|${aliq}|${values.vOper.toFixed(2).replace('.',',')}|${values.vBC.toFixed(2).replace('.',',')}|${values.vIcms.toFixed(2).replace('.',',')}||||`);
            countRecord('C190');
        });
        
        doc.doc.data?.forEach((item, index) => {
            lines.push(`|C170|${index+1}|${item.produto_nome || ''}|${parseSafeFloat(item.produto_qtd).toFixed(2).replace('.',',')}|UN|${parseSafeFloat(item.produto_valor_total).toFixed(2).replace('.',',')}||${item.produto_cfop}|${item.produto_cst_icms}||||`);
            countRecord('C170');
        });
    }
    
    lines.push(`|C990|${1 + (recordCounts['C100'] || 0) + (recordCounts['C170'] || 0) + (recordCounts['C190'] || 0) + 1}|`);
    countRecord('C990');
    
    // Bloco 9
    lines.push('|9001|0|');
    countRecord('9001');

    lines.push('|0990|2|');
    countRecord('0990');
    
    const finalRecordCounts = { ...recordCounts };
    finalRecordCounts['9990'] = 1; // Self-reference for 9990
    finalRecordCounts['9999'] = 1; // Self-reference for 9999
    
    const sortedRecords = Object.keys(finalRecordCounts).sort();
    sortedRecords.forEach(rec => {
        lines.push(`|9900|${rec}|${finalRecordCounts[rec]}|`);
        countRecord('9900');
    });

    lines.push(`|9990|${(recordCounts['9001'] || 0) + (recordCounts['9900'] || 0) + 1}|`);
    countRecord('9990');

    const totalLines = lines.length + 1;
    lines.push(`|9999|${totalLines}|`);

    return {
        filename: `SPED-EFD-${today.toISOString().split('T')[0]}.txt`,
        content: lines.join('\n')
    };
};

export const runAccountingAnalysis = async (report: Omit<AuditReport, 'summary'>): Promise<AuditReport> => {
    // 1. Run deterministic calculations first
    const aggregatedMetrics = runDeterministicAccounting(report);

    // 2. Generate Accounting Entries
    const accountingEntries = generateAccountingEntries(report.documents);
    
    // 3. Generate SPED File
    const spedFile = generateSpedEfd(report);

    const validDocsData = report.documents
        .filter(d => d.status !== 'ERRO' && d.doc.data)
        .flatMap(d => d.doc.data!);
    
    if (validDocsData.length === 0) {
        // Return a default summary if no valid data is available
        const keyMetricsArray: KeyMetric[] = Object.values(aggregatedMetrics);
        keyMetricsArray.push({
            metric: 'Análise de IA',
            value: 'Indisponível',
            status: 'UNAVAILABLE',
            explanation: 'A análise por IA não pôde ser executada devido à falta de dados válidos.',
        });

        const defaultSummary: AnalysisResult = {
            title: "Análise Fiscal Concluída com Alertas",
            summary: "Não foram encontrados dados válidos para gerar um resumo detalhado. Verifique os documentos com erro ou o conteúdo dos arquivos enviados.",
            keyMetrics: keyMetricsArray,
            actionableInsights: ["Verificar a causa dos erros nos documentos importados para permitir uma análise completa.", "Garantir que os arquivos CSV/XLSX contenham colunas com valores monetários e identificadores de nota fiscal."],
            strategicRecommendations: ["Implementar um processo de validação de arquivos na origem para garantir a qualidade dos dados para análise."]
        };
         return { ...report, summary: defaultSummary, aggregatedMetrics, accountingEntries, spedFile };
    }
    
    const { default: Papa } = await import('papaparse');
    const dataSampleForAI = Papa.unparse(validDocsData.slice(0, 200));

    // 4. Run AI analysis with deterministic data as context
    const summary = await runAIAccountingSummary(dataSampleForAI, aggregatedMetrics);

    // 5. Combine results
    return { ...report, summary, aggregatedMetrics, accountingEntries, spedFile };
};