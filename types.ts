// types.ts

export interface ChartDataPoint {
  label: string;
  value: number; // Y-axis for scatter
  x?: number;    // X-axis for scatter
  color?: string;
}

export interface ChartData {
  type: 'bar' | 'pie' | 'line' | 'scatter';
  title: string;
  data: ChartDataPoint[];
  options?: Record<string, any>;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  chartData?: ChartData;
  rawText?: string;
  parseError?: string;
}

// FIX: Added ExportType for chat export functionality.
export type ExportType = 'docx' | 'html' | 'pdf';

export interface KeyMetric {
  metric: string;
  value: string;
  insight?: string;
  status: 'OK' | 'PARTIAL' | 'UNAVAILABLE' | 'ALERT';
  explanation?: string;
}

export interface AnalysisResult {
  title: string;
  summary: string;
  keyMetrics: KeyMetric[];
  actionableInsights: string[];
  strategicRecommendations?: string[];
}

export interface NfeData {
  fileCount: number;
  totalSize: number;
  fileDetails: { name: string; size: number }[];
  dataSample: string; // CSV string of data sample
}

export type ImportedDoc = {
  kind: "NFE_XML" | "CSV" | "XLSX" | "PDF" | "IMAGE" | "UNSUPPORTED";
  name: string;
  size: number;
  status: "parsed" | "ocr_needed" | "unsupported" | "error";
  data?: Record<string, any>[]; // Parsed data for CSV/XLSX/XML
  text?: string; // Text content for PDF/OCR
  raw?: File;
  error?: string;
  meta?: {
    source_zip: string;
    internal_path: string;
  };
};

// --- New Types for Agent Orchestration ---
// FIX: Added and exported Agent state types that were missing, causing import errors.
export type AgentName = 'ocr' | 'auditor' | 'classifier' | 'crossValidator' | 'intelligence' | 'accountant' | 'reconciliation';

export interface AgentProgress {
  step: string;
  current: number;
  total: number;
}

export interface AgentState {
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: AgentProgress;
}

export type AgentStates = Record<AgentName, AgentState>;


// --- New Types for Detailed Audit Report ---

export type AuditStatus = 'OK' | 'ALERTA' | 'ERRO';

export interface Inconsistency {
  code: string;
  message: string;
  explanation: string; // XAI part
  normativeBase?: string; // Legal reference
  severity: 'ERRO' | 'ALERTA' | 'INFO';
}

export interface ClassificationResult {
    operationType: 'Compra' | 'Venda' | 'Devolução' | 'Serviço' | 'Transferência' | 'Outros';
    businessSector: string; // e.g., 'Indústria', 'Comércio', 'Tecnologia'
    confidence: number;
    costCenter?: string; // e.g., 'Vendas', 'Marketing', 'TI'
}

export type ReconciliationStatus = 'CONCILIADO' | 'PENDENTE';

export interface AuditedDocument {
  doc: ImportedDoc;
  status: AuditStatus;
  score?: number; // Weighted score of inconsistencies
  inconsistencies: Inconsistency[];
  classification?: ClassificationResult;
  reconciliationStatus?: ReconciliationStatus;
}

export interface AccountingEntry {
  docName: string;
  account: string;
  type: 'D' | 'C'; // Débito or Crédito
  value: number;
}

export interface SpedFile {
    filename: string;
    content: string;
}

// --- Bank Reconciliation Types ---
export interface BankTransaction {
    id: string;
    date: string; // YYYY-MM-DD
    amount: number; // Negative for debits, positive for credits
    description: string;
    type: 'DEBIT' | 'CREDIT' | 'OTHER';
    sourceFile: string;
}

export interface ReconciliationMatch {
    doc: AuditedDocument;
    transaction: BankTransaction;
}

export interface ReconciliationResult {
    matchedPairs: ReconciliationMatch[];
    unmatchedDocuments: AuditedDocument[];
    unmatchedTransactions: BankTransaction[];
}

// --- New Types for AI-Driven Analysis ---

export type AIFindingSeverity = 'INFO' | 'BAIXA' | 'MÉDIA' | 'ALTA';

export interface AIDrivenInsight {
    category: 'Eficiência Operacional' | 'Risco Fiscal' | 'Oportunidade de Otimização' | 'Anomalia de Dados';
    description: string;
    severity: AIFindingSeverity;
    evidence: string[]; // e.g., document names or product names
}

export interface CrossValidationResult {
    attribute: string;
    observation: string;
    documents: {
        name: string;
        value: string | number;
    }[];
}

export interface SmartSearchResult {
    summary: string;
    data?: string[][]; // Optional structured data for a table
    references?: string[];
}

export interface DeterministicDiscrepancy {
  valueA: string | number;
  docA: { name: string; internal_path?: string };
  valueB: string | number;
  docB: { name: string; internal_path?: string };
}

export interface DeterministicCrossValidationResult {
  comparisonKey: string; // e.g., the product name
  attribute: string; // e.g., 'Preço Unitário'
  description: string;
  discrepancies: DeterministicDiscrepancy[];
  severity: 'ALERTA' | 'INFO';
}

export interface AuditReport {
  summary: AnalysisResult;
  documents: AuditedDocument[];
  aggregatedMetrics?: Record<string, number | string | KeyMetric>;
  accountingEntries?: AccountingEntry[];
  spedFile?: SpedFile;
  aiDrivenInsights?: AIDrivenInsight[];
  crossValidationResults?: CrossValidationResult[];
  deterministicCrossValidation?: DeterministicCrossValidationResult[];
  reconciliationResult?: ReconciliationResult;
}