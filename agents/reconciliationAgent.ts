// agents/reconciliationAgent.ts
import type { AuditedDocument, BankTransaction, ReconciliationResult } from '../types';
import { parseSafeFloat } from '../utils/parsingUtils';
import dayjs from 'dayjs';

const AMOUNT_TOLERANCE = 0.02; // Tolerância de 2 centavos para comparação de valores
const DATE_WINDOW_DAYS = 30; // Janela de dias para considerar uma data correspondente

/**
 * Realiza a conciliação entre documentos fiscais auditados e transações bancárias.
 * @param documents A lista de documentos auditados da análise fiscal.
 * @param transactions A lista de transações bancárias importadas dos extratos.
 * @returns Um objeto com os resultados da conciliação.
 */
export const runReconciliation = async (
    documents: AuditedDocument[],
    transactions: BankTransaction[]
): Promise<ReconciliationResult> => {

    const pendingDocuments = [...documents.filter(d => d.status !== 'ERRO' && d.doc.data && d.doc.data.length > 0)];
    const availableTransactions = [...transactions];
    
    const matchedPairs: ReconciliationResult['matchedPairs'] = [];
    
    // Iterar de trás para frente para poder remover itens com segurança
    for (let i = pendingDocuments.length - 1; i >= 0; i--) {
        const doc = pendingDocuments[i];
        const docTotal = parseSafeFloat(doc.doc.data?.[0]?.valor_total_nfe);
        const docDate = dayjs(doc.doc.data?.[0]?.data_emissao);

        if (docTotal === 0 || !docDate.isValid()) continue;

        let bestMatchIndex = -1;
        
        // Encontrar a melhor transação correspondente
        for (let j = 0; j < availableTransactions.length; j++) {
            const trans = availableTransactions[j];
            const transAmount = Math.abs(trans.amount);
            const transDate = dayjs(trans.date);

            const isAmountMatch = Math.abs(docTotal - transAmount) <= AMOUNT_TOLERANCE;
            const isDateMatch = Math.abs(docDate.diff(transDate, 'day')) <= DATE_WINDOW_DAYS;

            if (isAmountMatch && isDateMatch) {
                bestMatchIndex = j;
                break; // Encontrou um bom par, para de procurar por este documento
            }
        }
        
        if (bestMatchIndex !== -1) {
            const matchedTransaction = availableTransactions[bestMatchIndex];
            matchedPairs.push({ doc, transaction: matchedTransaction });
            
            // Remover os itens pareados das listas de disponíveis
            pendingDocuments.splice(i, 1);
            availableTransactions.splice(bestMatchIndex, 1);
        }
    }
    
    // Simula um tempo de processamento
    await new Promise(resolve => setTimeout(resolve, 500));

    return {
        matchedPairs,
        unmatchedDocuments: pendingDocuments,
        unmatchedTransactions: availableTransactions
    };
};