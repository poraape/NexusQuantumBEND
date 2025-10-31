import { useState, useCallback, useRef, useEffect } from 'react';
import type { Chat } from '@google/genai';
import type { ChatMessage, AuditReport, ClassificationResult, AgentStates, AgentState, ReconciliationResult, AuditedDocument } from '../types';
import { logger } from '../services/logger';
import { importFiles, importBankFiles } from '../utils/importPipeline';
import { runAudit } from '../agents/auditorAgent';
import { runClassification } from '../agents/classifierAgent';
import { runIntelligenceAnalysis } from '../agents/intelligenceAgent';
import { runAccountingAnalysis } from '../agents/accountantAgent';
import { runDeterministicCrossValidation } from '../utils/fiscalCompare';
import { startChat } from '../services/chatService';
import { runReconciliation } from '../agents/reconciliationAgent';
import { parseSafeFloat } from '../utils/parsingUtils';


const sanitizeModelResponse = (rawText: string): string => {
    return rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
};

const parseChatResponse = (rawText: string) => {
    const cleaned = sanitizeModelResponse(rawText);
    try {
        const parsed = JSON.parse(cleaned);
        if (typeof parsed !== 'object' || parsed === null) {
            throw new Error('Objeto JSON vazio ou inválido.');
        }

        const text = typeof parsed.text === 'string' && parsed.text.trim().length > 0
            ? parsed.text
            : cleaned;

        return {
            parsed: true,
            text,
            chartData: typeof parsed.chartData === 'object' ? parsed.chartData : undefined,
            error: undefined as string | undefined,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.log('Chat', 'ERROR', 'Falha ao interpretar a resposta da IA como JSON.', {
            error: errorMessage,
            rawResponse: rawText,
        });

        return {
            parsed: false,
            text: cleaned,
            chartData: undefined,
            error: errorMessage,
        };
    }
};

const initialAgentStates: AgentStates = {
    ocr: { status: 'pending', progress: { step: 'Aguardando arquivos', current: 0, total: 0 } },
    auditor: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    classifier: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    crossValidator: { status: 'pending', progress: { step: ``, current: 0, total: 0 } },
    intelligence: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    accountant: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    reconciliation: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
};

const CLASSIFICATION_CORRECTIONS_KEY = 'nexus-classification-corrections';
const COST_CENTER_CORRECTIONS_KEY = 'nexus-cost-center-corrections';


const getDetailedErrorMessage = (error: unknown): string => {
    logger.log('ErrorHandler', 'ERROR', 'Analisando erro da aplicação.', { error });

    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('api key not valid')) return 'Chave de API inválida. Verifique sua configuração.';
        if (message.includes('quota')) return 'Cota da API excedida. Por favor, tente novamente mais tarde.';
        if (error.name.includes('Google')) {
            return `Erro na comunicação com a IA: ${error.message}`;
        }
        return error.message;
    }
    if (typeof error === 'string') return error;
    return 'Ocorreu um erro desconhecido durante a operação.';
};


export const useAgentOrchestrator = () => {
    const [agentStates, setAgentStates] = useState<AgentStates>(initialAgentStates);
    const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pipelineError, setPipelineError] = useState<boolean>(false);
    const [isPipelineComplete, setIsPipelineComplete] = useState(false);
    const [allUploadedFiles, setAllUploadedFiles] = useState<File[]>([]);
    const [costCenterCorrections, setCostCenterCorrections] = useState<Record<string, string>>({});

    const chatSessionRef = useRef<Chat | null>(null);
    const storageAvailableRef = useRef(true);

    useEffect(() => {
        try {
            const storedClassCorrections = localStorage.getItem(CLASSIFICATION_CORRECTIONS_KEY);
            if (storedClassCorrections) setClassificationCorrections(JSON.parse(storedClassCorrections));

            const storedCostCenterCorrections = localStorage.getItem(COST_CENTER_CORRECTIONS_KEY);
            if (storedCostCenterCorrections) setCostCenterCorrections(JSON.parse(storedCostCenterCorrections));
        } catch (e) {
            logger.log('Orchestrator', 'ERROR', 'Falha ao carregar correções do localStorage.', { error: e });
            storageAvailableRef.current = false;
        }
    }, []);

    const reset = useCallback(() => {
        chatSessionRef.current = null;
        setAgentStates(initialAgentStates);
        setError(null);
        setPipelineError(false);
        setAuditReport(null);
        setMessages([]);
        setIsPipelineComplete(false);
        setAllUploadedFiles([]);
    }, []);

    const runPipeline = useCallback(async (newFiles: File[]) => {
        logger.log('Orchestrator', 'INFO', 'Iniciando pipeline de análise.');

        setPipelineError(false);
        setIsPipelineComplete(false);
        setAuditReport(null);
        setMessages([]);

        const currentFiles = [...allUploadedFiles, ...newFiles];
        setAllUploadedFiles(currentFiles);

        // Frontend Pipeline (existing logic for all files)
        try {
            setAgentStates(prev => ({ ...prev, ocr: { status: 'running', progress: { step: 'Analisando arquivos...', current: 0, total: currentFiles.length }}}));
            const importedDocs = await importFiles(currentFiles, (current, total) => {
                setAgentStates(prev => ({...prev, ocr: { ...prev.ocr, progress: { step: `Processando arquivo ${current} de ${total}`, current, total }}}));
            });
            setAgentStates(prev => ({...prev, ocr: { status: 'completed', progress: { step: `Arquivos importados`, current: currentFiles.length, total: currentFiles.length }}}));
            
            setAgentStates(prev => ({...prev, auditor: { status: 'running', progress: { step: `Executando ${importedDocs.length} auditorias...`, current: 0, total: 1 }}}));
            let partialReport: any = await runAudit(importedDocs);
            setAgentStates(prev => ({...prev, auditor: { status: 'completed', progress: { step: `Auditoria concluída`, current: 1, total: 1 }}}));

            setAgentStates(prev => ({...prev, classifier: { status: 'running', progress: { step: `Classificando ${partialReport.documents.length} documentos...`, current: 0, total: 1 }}}));
            partialReport = await runClassification(partialReport, classificationCorrections, costCenterCorrections);
            setAgentStates(prev => ({...prev, classifier: { status: 'completed', progress: { step: `Classificação concluída`, current: 1, total: 1 }}}));

            setAgentStates(prev => ({...prev, crossValidator: { status: 'running', progress: { step: `Comparando documentos...`, current: 0, total: 1 }}}));
            const deterministicCVResults = await runDeterministicCrossValidation(partialReport);
            partialReport.deterministicCrossValidation = deterministicCVResults;
            setAgentStates(prev => ({...prev, crossValidator: { status: 'completed', progress: { step: `Comparação concluída`, current: 1, total: 1 }}}));
            
            setAgentStates(prev => ({...prev, intelligence: { status: 'running', progress: { step: `Análise com IA...`, current: 0, total: 1 }}}));
            const aiResults = await runIntelligenceAnalysis(partialReport);
            partialReport.aiDrivenInsights = aiResults.aiDrivenInsights;
            partialReport.crossValidationResults = aiResults.crossValidationResults;
            setAgentStates(prev => ({...prev, intelligence: { status: 'completed', progress: { step: `Análise com IA concluída`, current: 1, total: 1 }}}));
            
            setAgentStates(prev => ({...prev, accountant: { status: 'running', progress: { step: `Gerando sumário executivo...`, current: 0, total: 1 }}}));
            const finalReport = await runAccountingAnalysis(partialReport);
            setAgentStates(prev => ({...prev, accountant: { status: 'completed', progress: { step: `Relatório finalizado`, current: 1, total: 1 }}}));

            setAuditReport(finalReport);
            setIsPipelineComplete(true);

            const allItems = finalReport.documents
                .filter(d => d.status !== 'ERRO' && d.doc.data)
                .flatMap(d => d.doc.data!);
            
            const { default: Papa } = await import('papaparse');
            const dataSampleForChat = allItems.length > 0 ? Papa.unparse(allItems.slice(0, 200)) : "Nenhum dado de item válido foi encontrado.";
            chatSessionRef.current = startChat(dataSampleForChat, finalReport.aggregatedMetrics);

            setMessages([{ id: 'initial-ai-message', sender: 'ai', text: 'Sua análise fiscal está pronta. Explore os detalhes ou me faça uma pergunta.' }]);
        
        } catch (err) {
            const errorMessage = getDetailedErrorMessage(err);
            setError(errorMessage);
            setPipelineError(true);
            setIsPipelineComplete(true);
            setAgentStates(initialAgentStates);
        }
    }, [allUploadedFiles, classificationCorrections, costCenterCorrections]);

    const runReconciliationPipeline = useCallback(async (bankFiles: File[]) => {
        if (!auditReport) {
            setError("Execute uma análise fiscal antes de iniciar a conciliação.");
            return;
        }
        logger.log('Orchestrator', 'INFO', 'Iniciando pipeline de conciliação bancária.');
        setAgentStates(prev => ({ ...prev, reconciliation: { status: 'running', progress: { step: 'Lendo extratos...', current: 0, total: bankFiles.length }}}));
        setError(null);

        try {
            const bankTransactions = await importBankFiles(bankFiles);
            if (bankTransactions.length === 0) throw new Error("Nenhuma transação válida encontrada nos extratos bancários.");
            
            setAgentStates(prev => ({ ...prev, reconciliation: { status: 'running', progress: { step: 'Cruzando dados...', current: 1, total: 2 }}}));
            const reconciliationResult = await runReconciliation(auditReport.documents, bankTransactions);

            setAuditReport(prev => {
                if (!prev) return null;
                const docMap = new Map<string, AuditedDocument>(prev.documents.map(d => [d.doc.name, d]));
                
                reconciliationResult.matchedPairs.forEach(pair => {
                    const doc = docMap.get(pair.doc.doc.name);
                    if (doc) doc.reconciliationStatus = 'CONCILIADO';
                });

                return { ...prev, documents: Array.from(docMap.values()), reconciliationResult };
            });

             setAgentStates(prev => ({ ...prev, reconciliation: { status: 'completed', progress: { step: 'Conciliação finalizada', current: 2, total: 2 }}}));
        } catch(err) {
            const errorMessage = getDetailedErrorMessage(err);
            setError(`Falha na conciliação: ${errorMessage}`);
            setAgentStates(prev => ({ ...prev, reconciliation: { status: 'error', progress: { ...prev.reconciliation.progress, step: 'Erro' }}}));
        }
    }, [auditReport]);

    const handleSendMessage = useCallback(async (message: string) => {
        if (!chatSessionRef.current) {
            setError('A sessão de chat não foi inicializada.');
            return;
        }
    
        const userMessage: ChatMessage = { id: Date.now().toString(), sender: 'user', text: message };
        const aiMessageId = (Date.now() + 1).toString();
        const initialAiMessage: ChatMessage = { id: aiMessageId, sender: 'ai', text: '' };
    
        setMessages(prev => [...prev, userMessage, initialAiMessage]);
        setIsStreaming(true);
    
        let fullResponseText = '';
        try {
            const stream = await chatSessionRef.current.sendMessageStream({ message });
    
            for await (const chunk of stream) {
                fullResponseText += chunk.text;
                // Update the last AI message in the state with the streaming text
                setMessages(prev => prev.map(msg => 
                    msg.id === aiMessageId ? { ...msg, text: fullResponseText } : msg
                ));
            }
    
            // Once streaming is complete, parse the full text for chart data
            if (fullResponseText) {
                const { parsed, text: finalText, chartData, error: parseError } = parseChatResponse(fullResponseText);

                setMessages(prev => prev.map(msg =>
                    msg.id === aiMessageId ? {
                        ...msg,
                        text: finalText,
                        chartData,
                        rawText: fullResponseText,
                        parseError,
                    } : msg
                ));

                if (!parsed && parseError) {
                    setError('A resposta da IA não estava em JSON válido. Exibindo o conteúdo bruto retornado.');
                }
            } else {
                 throw new Error("A IA retornou uma resposta vazia.");
            }

        } catch (err) {
            const finalMessage = getDetailedErrorMessage(err);
            setError(finalMessage);
            // Remove the placeholder AI message on error
            setMessages(prev => prev.filter(msg => msg.id !== aiMessageId));
        } finally {
            setIsStreaming(false);
        }
    }, []);

    const handleClassificationChange = useCallback((docName: string, newClassification: ClassificationResult['operationType']) => {
        setAuditReport(prevReport => {
            if (!prevReport) return null;
            const updatedDocs = prevReport.documents.map(doc => {
                if (doc.doc.name === docName && doc.classification) {
                    return { ...doc, classification: { ...doc.classification, operationType: newClassification, confidence: 1.0 } };
                }
                return doc;
            });
            return { ...prevReport, documents: updatedDocs };
        });
        
        const newCorrections = { ...classificationCorrections, [docName]: newClassification };
        setClassificationCorrections(newCorrections);
        if (storageAvailableRef.current) {
            try {
                localStorage.setItem(CLASSIFICATION_CORRECTIONS_KEY, JSON.stringify(newCorrections));
            } catch(e) {
                storageAvailableRef.current = false;
                logger.log('Orchestrator', 'ERROR', `Falha ao salvar correção de classificação no localStorage.`, { error: e });
            }
        }
    }, [classificationCorrections]);
    
    const handleCostCenterChange = useCallback((docName: string, newCostCenter: string) => {
        setAuditReport(prevReport => {
            if (!prevReport) return null;
            const updatedDocs = prevReport.documents.map(doc => {
                if (doc.doc.name === docName && doc.classification) {
                    return { ...doc, classification: { ...doc.classification, costCenter: newCostCenter } };
                }
                return doc;
            });
            return { ...prevReport, documents: updatedDocs };
        });

        const newCorrections = { ...costCenterCorrections, [docName]: newCostCenter };
        setCostCenterCorrections(newCorrections);
        if (storageAvailableRef.current) {
            try {
                localStorage.setItem(COST_CENTER_CORRECTIONS_KEY, JSON.stringify(newCorrections));
            } catch(e) {
                storageAvailableRef.current = false;
                logger.log('Orchestrator', 'ERROR', `Falha ao salvar correção de centro de custo no localStorage.`, { error: e });
            }
        }
    }, [costCenterCorrections]);

    const handleStopStreaming = useCallback(() => {
        logger.log('Orchestrator', 'WARN', 'A parada de streaming não é suportada na arquitetura atual.');
    }, []);

    const isAnyAgentRunning = (Object.values(agentStates) as AgentState[]).some(state => state.status === 'running');

    return {
        agentStates,
        auditReport,
        setAuditReport,
        messages,
        isStreaming,
        error: error,
        isPipelineRunning: !isPipelineComplete && isAnyAgentRunning,
        isPipelineComplete,
        pipelineError,
        runPipeline,
        handleSendMessage,
        handleStopStreaming,
        setError,
        handleClassificationChange,
        handleCostCenterChange,
        runReconciliationPipeline,
        reset,
    };
};