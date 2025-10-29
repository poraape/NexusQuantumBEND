import { useState, useCallback, useRef, useEffect } from 'react';
import type { Chat } from '@google/genai';
import type { ChatMessage, AuditReport, ClassificationResult, AgentStates } from '../types';
import { logger } from '../services/logger';
import { importFiles } from '../utils/importPipeline';
import { runAudit } from '../agents/auditorAgent';
import { runClassification } from '../agents/classifierAgent';
import { runIntelligenceAnalysis } from '../agents/intelligenceAgent';
import { runAccountingAnalysis } from '../agents/accountantAgent';
import { runDeterministicCrossValidation } from '../utils/fiscalCompare';
import { startChat } from '../services/chatService';


const initialAgentStates: AgentStates = {
    ocr: { status: 'pending', progress: { step: 'Aguardando arquivos', current: 0, total: 0 } },
    auditor: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    classifier: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    crossValidator: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    intelligence: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    accountant: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
};

const CORRECTIONS_STORAGE_KEY = 'nexus-classification-corrections';

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
    const [classificationCorrections, setClassificationCorrections] = useState<Record<string, ClassificationResult['operationType']>>({});
    
    const chatSessionRef = useRef<Chat | null>(null);
    
    useEffect(() => {
        try {
            const storedCorrections = localStorage.getItem(CORRECTIONS_STORAGE_KEY);
            if (storedCorrections) {
                setClassificationCorrections(JSON.parse(storedCorrections));
            }
        } catch (e) {
            logger.log('Orchestrator', 'ERROR', 'Falha ao carregar correções do localStorage.', { error: e });
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
    }, []);

    const runPipeline = useCallback(async (files: File[]) => {
        reset();
        logger.log('Orchestrator', 'INFO', 'Iniciando pipeline de análise no frontend.');
        
        try {
            // Etapa 1: Importação e OCR
            setAgentStates(prev => ({ ...prev, ocr: { status: 'running', progress: { step: 'Analisando arquivos...', current: 0, total: files.length }}}));
            const importedDocs = await importFiles(files, (current, total) => {
                setAgentStates(prev => ({...prev, ocr: { ...prev.ocr, progress: { step: `Processando arquivo ${current} de ${total}`, current, total }}}));
            });
            setAgentStates(prev => ({...prev, ocr: { status: 'completed', progress: { step: `Arquivos importados`, current: files.length, total: files.length }}}));
            
            // Etapa 2: Auditoria Determinística
            setAgentStates(prev => ({...prev, auditor: { status: 'running', progress: { step: `Executando ${importedDocs.length} auditorias...`, current: 0, total: 1 }}}));
            let partialReport: any = await runAudit(importedDocs);
            setAgentStates(prev => ({...prev, auditor: { status: 'completed', progress: { step: `Auditoria concluída`, current: 1, total: 1 }}}));

            // Etapa 3: Classificação Heurística
            setAgentStates(prev => ({...prev, classifier: { status: 'running', progress: { step: `Classificando ${partialReport.documents.length} documentos...`, current: 0, total: 1 }}}));
            partialReport = await runClassification(partialReport, classificationCorrections);
            setAgentStates(prev => ({...prev, classifier: { status: 'completed', progress: { step: `Classificação concluída`, current: 1, total: 1 }}}));

            // Etapa 4: Validação Cruzada Determinística
            setAgentStates(prev => ({...prev, crossValidator: { status: 'running', progress: { step: `Comparando documentos...`, current: 0, total: 1 }}}));
            const deterministicCVResults = await runDeterministicCrossValidation(partialReport);
            partialReport.deterministicCrossValidation = deterministicCVResults;
            setAgentStates(prev => ({...prev, crossValidator: { status: 'completed', progress: { step: `Comparação concluída`, current: 1, total: 1 }}}));
            
            // Etapa 5: Inteligência (IA)
            setAgentStates(prev => ({...prev, intelligence: { status: 'running', progress: { step: `Análise com IA...`, current: 0, total: 1 }}}));
            const aiResults = await runIntelligenceAnalysis(partialReport);
            partialReport.aiDrivenInsights = aiResults.aiDrivenInsights;
            partialReport.crossValidationResults = aiResults.crossValidationResults;
            setAgentStates(prev => ({...prev, intelligence: { status: 'completed', progress: { step: `Análise com IA concluída`, current: 1, total: 1 }}}));
            
            // Etapa 6: Contabilidade (Sumarização final com IA)
            setAgentStates(prev => ({...prev, accountant: { status: 'running', progress: { step: `Gerando sumário executivo...`, current: 0, total: 1 }}}));
            const finalReport = await runAccountingAnalysis(partialReport);
            setAgentStates(prev => ({...prev, accountant: { status: 'completed', progress: { step: `Relatório finalizado`, current: 1, total: 1 }}}));

            setAuditReport(finalReport);
            setIsPipelineComplete(true);

            // Inicia o chat
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
            setAgentStates(initialAgentStates); // Reset states on failure
        }
    }, [reset, classificationCorrections]);

    const handleSendMessage = useCallback(async (message: string) => {
        if (!chatSessionRef.current) {
            setError('A sessão de chat não foi inicializada.');
            return;
        }

        const userMessage: ChatMessage = { id: Date.now().toString(), sender: 'user', text: message };
        setMessages(prev => [...prev, userMessage]);
        setIsStreaming(true);

        try {
            const response = await chatSessionRef.current.sendMessage({ message });
            const responseText = response.text;
            
            if (!responseText) throw new Error("A IA retornou uma resposta vazia.");
            
            const parsedResponse = JSON.parse(responseText);
            
            const aiMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                sender: 'ai',
                text: parsedResponse.text,
                chartData: parsedResponse.chartData || undefined
            };
            setMessages(prev => [...prev, aiMessage]);

        } catch (err) {
            const finalMessage = getDetailedErrorMessage(err);
            setError(finalMessage);
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
        try {
            localStorage.setItem(CORRECTIONS_STORAGE_KEY, JSON.stringify(newCorrections));
        } catch(e) {
            logger.log('Orchestrator', 'ERROR', `Falha ao salvar correção no localStorage.`, { error: e });
        }
    }, [classificationCorrections]);

    const handleStopStreaming = useCallback(() => {
        logger.log('Orchestrator', 'WARN', 'A parada de streaming não é suportada na arquitetura atual.');
    }, []);

    return {
        agentStates,
        auditReport,
        setAuditReport,
        messages,
        isStreaming,
        error: error,
        isPipelineRunning: !isPipelineComplete && Object.values(agentStates).some(s => s.status === 'running'),
        isPipelineComplete,
        pipelineError,
        runPipeline,
        handleSendMessage,
        handleStopStreaming,
        setError,
        handleClassificationChange,
        reset,
    };
};