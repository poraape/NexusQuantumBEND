import React, { useState, useMemo } from 'react';
import type { AuditReport, AuditedDocument, AuditStatus, ClassificationResult, AccountingEntry, AIDrivenInsight, AIFindingSeverity, KeyMetric, ReconciliationStatus, CrossValidationResult, DeterministicCrossValidationResult } from '../types';
import { 
    MetricIcon, 
    InsightIcon, 
    ShieldCheckIcon, 
    ShieldExclamationIcon, 
    ChevronDownIcon,
    FileIcon,
    AiIcon,
    FileInfoIcon,
    UploadIcon,
    LoadingSpinnerIcon
} from './icons';
import ReconciliationView from './ReconciliationView';

// --- STYLES & CONFIGS ---

const statusStyles: { [key in AuditStatus]: { badge: string; icon: React.ReactNode; text: string; } } = {
    OK: { badge: 'bg-teal-500/20 text-teal-300 border-teal-500/30', icon: <ShieldCheckIcon className="w-5 h-5 text-teal-400" />, text: 'OK' },
    ALERTA: { badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', icon: <ShieldExclamationIcon className="w-5 h-5 text-yellow-400" />, text: 'Alerta' },
    ERRO: { badge: 'bg-red-500/20 text-red-300 border-red-500/30', icon: <ShieldExclamationIcon className="w-5 h-5 text-red-400" />, text: 'Erro' }
};

const reconciliationStatusStyles: { [key in ReconciliationStatus]: { icon: React.ReactNode; title: string; } } = {
    CONCILIADO: { icon: <ShieldCheckIcon className="w-4 h-4 text-green-400" />, title: 'Conciliado com extrato bancário' },
    PENDENTE: { icon: <FileInfoIcon className="w-4 h-4 text-yellow-400" />, title: 'Pendente de conciliação' }
};

const classificationOptions: ClassificationResult['operationType'][] = ['Compra', 'Venda', 'Devolução', 'Serviço', 'Transferência', 'Outros'];
const classificationStyles: { [key in ClassificationResult['operationType']]: string } = {
    Compra: 'bg-blue-500/30 text-blue-300', Venda: 'bg-green-500/30 text-green-300', Devolução: 'bg-orange-500/30 text-orange-300',
    Serviço: 'bg-purple-500/30 text-purple-300', Transferência: 'bg-indigo-500/30 text-indigo-300', Outros: 'bg-gray-500/30 text-gray-300',
};

const severityStyles: Record<AIFindingSeverity, string> = { INFO: 'border-l-sky-500', BAIXA: 'border-l-yellow-500', MÉDIA: 'border-l-orange-500', ALTA: 'border-l-red-500' };

const statusConfig: Record<KeyMetric['status'], { icon: React.FC<any>; iconClass: string; borderClass: string; valueClass: string; }> = {
    OK: { icon: ShieldCheckIcon, iconClass: 'text-teal-400', borderClass: 'border-l-transparent hover:border-l-teal-500/50', valueClass: 'text-teal-300' },
    ALERT: { icon: ShieldExclamationIcon, iconClass: 'text-red-400', borderClass: 'border-l-red-500', valueClass: 'text-red-300' },
    PARTIAL: { icon: ShieldExclamationIcon, iconClass: 'text-yellow-400', borderClass: 'border-l-yellow-500', valueClass: 'text-yellow-300' },
    UNAVAILABLE: { icon: FileInfoIcon, iconClass: 'text-gray-500', borderClass: 'border-l-gray-600', valueClass: 'text-gray-500' }
};

// --- SUB-COMPONENTS ---

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="border-t border-gray-700 pt-8">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center text-left">
                <h2 className="text-xl font-bold text-gray-200">{title}</h2>
                <ChevronDownIcon className={`w-6 h-6 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && <div className="mt-4 animate-fade-in-down">{children}</div>}
        </div>
    );
};

const KeyMetricDisplay: React.FC<{ item: KeyMetric }> = ({ item }) => {
    const config = statusConfig[item.status] || statusConfig.UNAVAILABLE;
    return (
        <div className={`bg-gray-700/50 p-4 rounded-md relative border-l-4 transition-colors group ${config.borderClass}`} title={item.explanation}>
            <div className="absolute top-2 right-2 opacity-50 group-hover:opacity-100 transition-opacity"><config.icon className={`w-5 h-5 ${config.iconClass}`} /></div>
            <p className={`font-bold text-lg ${config.valueClass}`}>{item.value}</p>
            <p className="text-sm font-semibold text-gray-300">{item.metric}</p>
            {item.insight && <p className="text-xs text-gray-400 mt-1">{item.insight}</p>}
        </div>
    );
};

const DocumentItem: React.FC<{ item: AuditedDocument; onClassificationChange: Function; onCostCenterChange: Function; }> = ({ item, onClassificationChange, onCostCenterChange }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const { doc, status, score, inconsistencies, classification, reconciliationStatus } = item;
    return (
        <div className="bg-gray-700/50 rounded-lg">
            <div className={`flex items-center p-3 ${inconsistencies.length > 0 ? 'cursor-pointer' : ''} flex-wrap sm:flex-nowrap gap-2`} onClick={() => inconsistencies.length > 0 && setIsExpanded(!isExpanded)}>
                {statusStyles[status].icon}
                <span className="truncate mx-3 flex-1 text-gray-300 text-sm order-1 sm:order-none w-full sm:w-auto">{doc.name}</span>
                <div className="flex items-center gap-2 ml-auto order-2 sm:order-none">
                    {reconciliationStatus && <span title={reconciliationStatusStyles[reconciliationStatus].title}>{reconciliationStatusStyles[reconciliationStatus].icon}</span>}
                    {classification && (
                         <select value={classification.operationType} onChange={(e) => { e.stopPropagation(); onClassificationChange(doc.name, e.target.value); }} onClick={(e) => e.stopPropagation()} className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap border-none appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${classificationStyles[classification.operationType]}`}>
                            {classificationOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                         </select>
                    )}
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${statusStyles[status].badge}`}>{statusStyles[status].text}</span>
                    {inconsistencies.length > 0 && <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />}
                </div>
            </div>
            {isExpanded && inconsistencies.length > 0 && (
                 <div className="border-t border-gray-600/50 p-4 animate-fade-in-down"><h5 className="font-semibold text-sm mb-2 text-gray-300">Inconsistências Encontradas:</h5><ul className="space-y-3">{inconsistencies.map((inc, index) => (<li key={index} className="text-xs border-l-2 border-yellow-500/50 pl-3"><p className="font-semibold text-yellow-300">{inc.message} <span className="text-gray-500 font-mono">({inc.code})</span></p><p className="text-gray-400 mt-1"><span className="font-semibold">XAI:</span> {inc.explanation}</p></li>))}</ul></div>
            )}
        </div>
    );
};

// --- MAIN COMPONENT ---

interface ReportViewerProps {
    report: AuditReport;
    onClassificationChange: (docName: string, newClassification: ClassificationResult['operationType']) => void;
    onCostCenterChange: (docName: string, newCostCenter: string) => void;
    onStartReconciliation: (files: File[]) => void;
    isReconciliationRunning: boolean;
}

const ReportViewer: React.FC<ReportViewerProps> = ({ report, onClassificationChange, onCostCenterChange, onStartReconciliation, isReconciliationRunning }) => {
  const { summary, documents, accountingEntries, aiDrivenInsights, deterministicCrossValidation, crossValidationResults, reconciliationResult } = report;
  const [bankFiles, setBankFiles] = useState<File[]>([]);
  
  const handleBankFiles = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) setBankFiles(Array.from(e.target.files)); }
  const handleStartReconciliation = () => { if (bankFiles.length > 0) { onStartReconciliation(bankFiles); setBankFiles([]); } }

  const docStats = useMemo(() => documents.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
  }, {} as Record<AuditStatus, number>), [documents]);

  return (
    <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg animate-fade-in space-y-8">
      
      {/* Executive Summary */}
      <div>
        <h2 className="text-2xl font-bold text-gray-200 mb-4">Análise Executiva</h2>
        <div className="text-gray-300 space-y-6">
            <h3 data-export-title className="text-xl font-semibold text-blue-400">{summary.title}</h3>
            <p className="text-sm leading-relaxed">{summary.summary}</p>
            <div>
                <h4 className="flex items-center text-md font-semibold text-gray-300 mb-3"><MetricIcon className="w-5 h-5 mr-2 text-gray-400"/>Métricas Chave</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{summary.keyMetrics.map((item, index) => <KeyMetricDisplay key={index} item={item} />)}</div>
            </div>
            <div>
                <h4 className="flex items-center text-md font-semibold text-gray-300 mb-3"><InsightIcon className="w-5 h-5 mr-2 text-gray-400"/>Insights Acionáveis</h4>
                <ul className="list-disc list-inside space-y-2 text-sm">{summary.actionableInsights.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </div>
        </div>
      </div>

      {/* AI Insights */}
      {aiDrivenInsights && aiDrivenInsights.length > 0 && (
        <CollapsibleSection title="Insights Gerados por IA">
            <div className="space-y-3">{aiDrivenInsights.map((insight, index) => (
                <div key={index} className={`bg-gray-700/50 p-4 rounded-lg border-l-4 ${severityStyles[insight.severity]}`}>
                    <div className="flex justify-between items-start">
                        <div><p className="font-semibold text-gray-200">{insight.category}</p><p className="text-sm text-gray-400 mt-1">{insight.description}</p></div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-md`}>{insight.severity}</span>
                    </div>
                    {insight.evidence?.length > 0 && <p className="text-xs text-gray-500 mt-2"><span className="font-semibold">Evidências:</span> {insight.evidence.join(', ')}</p>}
                </div>
            ))}</div>
        </CollapsibleSection>
      )}

      {/* Cross Validation */}
      {(deterministicCrossValidation && deterministicCrossValidation.length > 0) && (
        <CollapsibleSection title="Validação Cruzada Determinística">
             <div className="bg-gray-700/30 p-4 rounded-lg space-y-4"><div className="max-h-96 overflow-y-auto pr-2">{deterministicCrossValidation.map((result, index) => (
                <div key={index} className={`bg-gray-800/50 p-4 rounded-lg border-l-4 mb-3 ${result.severity === 'ALERTA' ? 'border-l-yellow-500' : 'border-l-sky-500'}`}>
                    <p className="font-semibold text-gray-200">{result.attribute}: <span className="font-normal text-gray-400">"{result.comparisonKey}"</span></p>
                    <p className="text-sm text-yellow-300 mt-1">{result.description}</p>
                    <div className="mt-3">{result.discrepancies.map((d, i) => (
                        <div key={i} className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-xs pt-2 mt-2">
                            <div className="flex items-center gap-2 truncate"><FileIcon className="w-4 h-4 text-gray-500"/><span className="truncate text-gray-400" title={d.docA.name}>{d.docA.name}</span>: <span className="font-mono text-orange-300">{d.valueA}</span></div>
                            <div className="flex items-center gap-2 truncate"><FileIcon className="w-4 h-4 text-gray-500"/><span className="truncate text-gray-400" title={d.docB.name}>{d.docB.name}</span>: <span className="font-mono text-yellow-300">{d.valueB}</span></div>
                        </div>
                    ))}</div>
                </div>
            ))}</div></div>
        </CollapsibleSection>
      )}
      
       {/* Bank Reconciliation */}
       <CollapsibleSection title="Conciliação Bancária">
            <div className="bg-gray-700/30 p-4 rounded-lg space-y-4">
                {!isReconciliationRunning && !reconciliationResult && (
                    <><p className="text-xs text-gray-400 text-center">Faça o upload de extratos bancários (.OFX, .CSV) para cruzar com os documentos fiscais.</p><div className="flex items-center justify-center gap-3">
                        <label htmlFor="bank-file-upload" className="cursor-pointer bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold py-2 px-4 rounded-lg transition-colors flex items-center gap-2"><UploadIcon className="w-5 h-5" /><span>Selecionar Extrato(s)</span></label>
                        <input id="bank-file-upload" type="file" multiple accept=".ofx,.csv" className="hidden" onChange={handleBankFiles}/>
                        {bankFiles.length > 0 && <span className="text-sm text-gray-400">{bankFiles.length} arquivo(s) selecionado(s).</span>}
                    </div>
                    {bankFiles.length > 0 && <button onClick={handleStartReconciliation} disabled={isReconciliationRunning} className="w-full mt-2 bg-teal-600 hover:bg-teal-500 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-600">Iniciar Conciliação</button>}
                    </>
                )}
                {isReconciliationRunning && <div className="flex items-center justify-center gap-3 text-lg text-teal-300 p-8"><LoadingSpinnerIcon className="w-8 h-8 animate-spin" /><span>Realizando conciliação...</span></div>}
                {reconciliationResult && <ReconciliationView result={reconciliationResult} />}
            </div>
        </CollapsibleSection>

      {/* Document Details */}
      <CollapsibleSection title="Detalhes por Documento">
         <div className="bg-gray-700/30 p-4 rounded-lg mb-4 flex justify-around items-center text-center flex-wrap gap-4">
            <div className="text-gray-300"><span className="text-2xl font-bold">{documents.length}</span><br/><span className="text-xs">Total</span></div>
            <div className="text-teal-300"><span className="text-2xl font-bold">{docStats.OK || 0}</span><br/><span className="text-xs">OK</span></div>
            <div className="text-yellow-300"><span className="text-2xl font-bold">{docStats.ALERTA || 0}</span><br/><span className="text-xs">Alertas</span></div>
            <div className="text-red-300"><span className="text-2xl font-bold">{docStats.ERRO || 0}</span><br/><span className="text-xs">Erros</span></div>
         </div>
         <div className="space-y-2 max-h-96 overflow-y-auto pr-2">{documents.map((item, index) => <DocumentItem key={`${item.doc.name}-${index}`} item={item} onClassificationChange={onClassificationChange} onCostCenterChange={onCostCenterChange} />)}</div>
      </CollapsibleSection>
    </div>
  );
};

export default ReportViewer;
