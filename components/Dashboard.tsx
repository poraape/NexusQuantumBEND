import React, { useMemo, useState } from 'react';
import type { AuditReport, ChartData } from '../types';
import Chart from './Chart';
import CrossValidationPanel from './CrossValidationPanel';
import SmartSearch from './SmartSearch';
import { parseSafeFloat } from '../utils/parsingUtils';
import AnalysisDisplay from './AnalysisDisplay';
import dayjs from 'dayjs';
import { UploadIcon, LoadingSpinnerIcon } from './icons';
import ReconciliationView from './ReconciliationView';
import IcmsSimulationSettings from './IcmsSimulationSettings';

interface DashboardProps {
    report: AuditReport;
    dateFilter: { start: string; end: string };
    onStartReconciliation: (files: File[]) => void;
    isReconciliationRunning: boolean;
}

// Tabela de alíquotas de ICMS interestadual.
// Chave: 'ORIGEM-DESTINO'. O sistema usa fallbacks para casos não listados.
const ICMS_RATE_TABLE: Record<string, number> = {
    'SP-RJ': 12, 'SP-MG': 12, 'SP-ES': 12, 'SP-PR': 12, 'SP-SC': 12, 'SP-RS': 12,
    'RJ-SP': 12, 'RJ-MG': 12, 'RJ-ES': 12,
    'MG-SP': 12, 'MG-RJ': 12, 'MG-ES': 12,
    'BA-SP': 7, 'BA-RJ': 7, 'PE-SP': 7,
    'DEFAULT_INTERSTATE_SE_CO': 12, // Alíquota do S/SE/CO para N/NE/ES
    'DEFAULT_INTERSTATE_N_NE': 7, // Alíquota do N/NE/ES para S/SE/CO
    'DEFAULT_INTRASTATE': 18,
};

const UF_REGIONS: Record<string, 'S' | 'SE' | 'CO' | 'N' | 'NE'> = {
    SP: 'SE', RJ: 'SE', MG: 'SE', ES: 'SE',
    PR: 'S', SC: 'S', RS: 'S',
    MS: 'CO', MT: 'CO', GO: 'CO', DF: 'CO',
    AC: 'N', AP: 'N', AM: 'N', PA: 'N', RO: 'N', RR: 'N', TO: 'N',
    AL: 'NE', BA: 'NE', CE: 'NE', MA: 'NE', PB: 'NE', PE: 'NE', PI: 'NE', RN: 'NE', SE: 'NE',
};

const getIcmsRate = (originUf: string, destUf: string): number => {
    if (originUf === destUf) return ICMS_RATE_TABLE.DEFAULT_INTRASTATE;
    const key = `${originUf}-${destUf}`;
    if (ICMS_RATE_TABLE[key]) return ICMS_RATE_TABLE[key];

    const originRegion = UF_REGIONS[originUf];
    const destRegion = UF_REGIONS[destUf];

    if (originRegion && destRegion) {
        if ((originRegion === 'S' || originRegion === 'SE' || originRegion === 'CO') && (destRegion === 'N' || destRegion === 'NE')) {
            return ICMS_RATE_TABLE.DEFAULT_INTERSTATE_SE_CO;
        }
        if ((originRegion === 'N' || originRegion === 'NE') && (destRegion === 'S' || destRegion === 'SE' || destRegion === 'CO')) {
            return ICMS_RATE_TABLE.DEFAULT_INTERSTATE_N_NE;
        }
    }
    // Default for S-S, SE-SE, etc.
    return ICMS_RATE_TABLE.DEFAULT_INTERSTATE_SE_CO;
}


interface MemoizedChartData {
    cfopChart: ChartData;
    ncmChart: ChartData;
    ufChart: ChartData;
}

const Dashboard: React.FC<DashboardProps> = ({ report, dateFilter, onStartReconciliation, isReconciliationRunning }) => {
    const [bankFiles, setBankFiles] = useState<File[]>([]);

    const filteredDocuments = useMemo(() => {
        if (!dateFilter.start && !dateFilter.end) {
            return report.documents;
        }
        const start = dateFilter.start ? dayjs(dateFilter.start) : null;
        const end = dateFilter.end ? dayjs(dateFilter.end).endOf('day') : null;

        return report.documents.filter(doc => {
            const emissionDateStr = doc.doc.data?.[0]?.data_emissao;
            if (!emissionDateStr) return false;
            
            const emissionDate = dayjs(emissionDateStr);
            if (!emissionDate.isValid()) return false;

            if (start && emissionDate.isBefore(start)) return false;
            if (end && emissionDate.isAfter(end)) return false;

            return true;
        });
    }, [report.documents, dateFilter]);

    const chartData = useMemo((): MemoizedChartData => {
        const validDocs = filteredDocuments.filter(d => d.status !== 'ERRO' && d.doc.data && d.doc.data.length > 0);
        const allItems = validDocs.flatMap(d => d.doc.data!);
        
        const cfopData: Record<string, number> = {};
        const ncmData: Record<string, number> = {};

        for (const item of allItems) {
            const value = parseSafeFloat(item.produto_valor_total);
            if (Number.isNaN(value)) {
                continue;
            }

            const cfop = item.produto_cfop?.toString() || 'N/A';
            cfopData[cfop] = (cfopData[cfop] || 0) + value;

            const ncm = item.produto_ncm?.toString() || 'N/A';
            ncmData[ncm] = (ncmData[ncm] || 0) + value;
        }

        const ufDestData: Record<string, number> = {};
        validDocs.forEach((auditedDoc) => {
            if (auditedDoc.doc.data && auditedDoc.doc.data.length > 0) {
                const uf = auditedDoc.doc.data[0].destinatario_uf || 'N/A';
                ufDestData[uf] = (ufDestData[uf] || 0) + 1;
            }
        });


        return {
            cfopChart: {
                type: 'bar',
                title: 'Valor por CFOP (Top 10)',
                data: Object.entries(cfopData).sort((a,b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value })),
                yAxisLabel: 'Valor (R$)',
            },
            ncmChart: {
                type: 'pie',
                title: 'Distribuição por NCM (Top 5)',
                data: Object.entries(ncmData).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value })),
            },
            ufChart: {
                type: 'bar',
                title: 'Documentos por UF de Destino',
                data: Object.entries(ufDestData).map(([label, value]) => ({ label, value })),
                yAxisLabel: 'Qtd. Documentos',
            },
        };
    }, [filteredDocuments]);
    
    const handleBankFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setBankFiles(Array.from(e.target.files));
        }
    }
    
    const handleStartReconciliation = () => {
        if (bankFiles.length > 0) {
            onStartReconciliation(bankFiles);
            setBankFiles([]);
        }
    }

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg animate-fade-in space-y-8">
            <div>
                <h2 className="text-xl font-bold text-gray-200 mb-4">Dashboard Interativo</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                   <div className="bg-gray-700/50 p-4 rounded-md" data-chart-container="true">
                        <Chart {...chartData.cfopChart} />
                   </div>
                   <div className="bg-gray-700/50 p-4 rounded-md" data-chart-container="true">
                        <Chart {...chartData.ncmChart} />
                   </div>
                   <div className="bg-gray-700/50 p-4 rounded-md" data-chart-container="true">
                        <Chart {...chartData.ufChart} />
                   </div>
                </div>
            </div>
            
            <div>
                <h2 className="text-xl font-bold text-gray-200 mb-4 border-t border-gray-700 pt-8">Conciliação Bancária</h2>
                <div className="bg-gray-700/30 p-4 rounded-lg space-y-4">
                     {!isReconciliationRunning && !report.reconciliationResult && (
                        <>
                             <p className="text-xs text-gray-400 text-center">
                                Faça o upload de um ou mais extratos bancários (.OFX, .CSV) para cruzar com os documentos fiscais processados.
                            </p>
                            <div className="flex items-center justify-center gap-3">
                                <label htmlFor="bank-file-upload" className="cursor-pointer bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold py-2 px-4 rounded-lg transition-colors flex items-center gap-2">
                                    <UploadIcon className="w-5 h-5" />
                                    <span>Selecionar Extrato(s)</span>
                                </label>
                                <input id="bank-file-upload" type="file" multiple accept=".ofx,.csv" className="hidden" onChange={handleBankFiles}/>
                                {bankFiles.length > 0 && (
                                    <span className="text-sm text-gray-400">{bankFiles.length} arquivo(s) selecionado(s).</span>
                                )}
                            </div>
                            {bankFiles.length > 0 && (
                                <button
                                    onClick={handleStartReconciliation}
                                    disabled={isReconciliationRunning}
                                    className="w-full mt-2 bg-teal-600 hover:bg-teal-500 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-600"
                                >
                                    Iniciar Conciliação
                                </button>
                            )}
                        </>
                    )}
                    {isReconciliationRunning && (
                        <div className="flex items-center justify-center gap-3 text-lg text-teal-300 p-8">
                            <LoadingSpinnerIcon className="w-8 h-8 animate-spin" />
                            <span>Realizando conciliação...</span>
                        </div>
                    )}
                    {report.reconciliationResult && (
                        <ReconciliationView result={report.reconciliationResult} />
                    )}
                </div>
            </div>
            
            <div>
                <h2 className="text-xl font-bold text-gray-200 mb-4 border-t border-gray-700 pt-8">Simulação Tributária (What-If ICMS)</h2>
                <IcmsSimulationSettings filteredDocuments={filteredDocuments} />
            </div>

            <div>
                <h2 className="text-xl font-bold text-gray-200 mb-4 border-t border-gray-700 pt-8">Busca Inteligente com IA</h2>
                 <SmartSearch report={report} />
            </div>

            <div>
                <h2 className="text-xl font-bold text-gray-200 mb-4 border-t border-gray-700 pt-8">Validação Cruzada Determinística</h2>
                <p className="text-xs text-gray-500 mb-4">
                    Comparações baseadas em regras para encontrar discrepâncias objetivas entre os documentos, como variações de preço ou NCMs inconsistentes para o mesmo produto.
                </p>
                <AnalysisDisplay results={report.deterministicCrossValidation} />
            </div>

            <div>
                <h2 className="text-xl font-bold text-gray-200 mb-4 border-t border-gray-700 pt-8">Validação Cruzada por IA</h2>
                <p className="text-xs text-gray-500 mb-4">
                    A IA compara atributos fiscais e valores entre todos os itens para encontrar inconsistências sutis ou padrões que merecem atenção.
                </p>
                <CrossValidationPanel results={report.crossValidationResults} />
            </div>
        </div>
    );
};
