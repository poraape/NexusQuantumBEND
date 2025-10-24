import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, AuditReport, ClassificationResult, AgentName, AgentProgress, AgentState, AgentStates } from '../types';
import { logger } from '../services/logger';
import { apiClient } from '../services/apiClient'; // Importa o novo cliente de API

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
        if (error.name === 'TypeError' && error.message.toLowerCase().includes('failed to fetch')) {
            return 'Falha de conexão. Verifique sua internet ou possíveis problemas de CORS.';
        }
        const message = error.message.toLowerCase();
        if (message.includes('api key not valid')) return 'Chave de API inválida. Verifique sua configuração.';
        if (message.includes('quota')) return 'Cota da API excedida. Por favor, tente novamente mais tarde.';
        if (message.includes('400')) return 'Requisição inválida para a API. Verifique os dados enviados.';
        if (message.includes('401') || message.includes('permission denied')) return 'Não autorizado. Verifique sua chave de API e permissões.';
        if (message.includes('429')) return 'Muitas requisições. Por favor, aguarde e tente novamente.';
        if (message.includes('500') || message.includes('503')) return 'O serviço de IA está indisponível ou com problemas. Tente novamente mais tarde.';
        return error.message;
    }
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error !== null) {
        const errorObj = error as Record<string, unknown>;
        if (typeof errorObj.message === 'string') return errorObj.message;
        if (typeof errorObj.status === 'number') return `Ocorreu um erro de rede ou API com o status: ${errorObj.status}.`;
    }
    return 'Ocorreu um erro desconhecido durante a operação.';
};


export const useAgentOrchestrator = () => {
    const [agentStates, setAgentStates] = useState<AgentStates>(initialAgentStates);
    const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false); // Usado para indicar que o chat está aguardando resposta
    const [error, setError] = useState<string | null>(null);
    const [pipelineError, setPipelineError] = useState<boolean>(false);
    const [isPipelineComplete, setIsPipelineComplete] = useState(false);
    const [classificationCorrections, setClassificationCorrections] = useState<Record<string, ClassificationResult['operationType']>>({});

    const [taskId, setTaskId] = useState<string | null>(null);
    const pollingIntervalRef = useRef<number | null>(null);
    const chatSessionIdRef = useRef<string | null>(null);
    
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

    const stopPolling = useCallback(() => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
    }, []);
    
    const reset = useCallback(() => {
        stopPolling();
        setTaskId(null);
        chatSessionIdRef.current = null;
        setAgentStates(initialAgentStates);
        setError(null);
        setPipelineError(false);
        setAuditReport(null);
        setMessages([]);
        setIsPipelineComplete(false);
    }, [stopPolling]);

    // Efeito para polling do status do backend
    useEffect(() => {
        if (!taskId) return;

        pollingIntervalRef.current = window.setInterval(async () => {
            try {
                const statusResponse = await apiClient.getAnalysisStatus(taskId);
                setAgentStates(statusResponse.progress);

                if (statusResponse.status === 'COMPLETE' && statusResponse.reportUrl) {
                    stopPolling();
                    logger.log('Orchestrator', 'INFO', 'Pipeline concluído no backend. Buscando relatório final.');
                    const finalReport = await apiClient.getAnalysisReport(statusResponse.reportUrl);
                    setAuditReport(finalReport);
                    
                    const chatSession = await apiClient.startChatSession(finalReport);
                    chatSessionIdRef.current = chatSession.sessionId;
                    setMessages([
                        {
                            id: 'initial-ai-message',
                            sender: 'ai',
                            text: 'Sua análise fiscal (processada no backend) está pronta. Explore os detalhes ou me faça uma pergunta.',
                        },
                    ]);
                    setIsPipelineComplete(true);

                } else if (statusResponse.status === 'ERROR') {
                    stopPolling();
                    const errorMessage = getDetailedErrorMessage(statusResponse.error || 'Erro no processamento do backend.');
                    setError(errorMessage);
                    setPipelineError(true);
                    setIsPipelineComplete(true);
                }
            } catch (err) {
                stopPolling();
                const errorMessage = getDetailedErrorMessage(err);
                setError(errorMessage);
                setPipelineError(true);
                setIsPipelineComplete(true);
            }
        }, 2000); // Polling a cada 2 segundos

        return () => stopPolling();
    }, [taskId, stopPolling]);

    const runPipeline = useCallback(async (files: File[]) => {
        reset();
        logger.log('Orchestrator', 'INFO', 'Iniciando pipeline via API do backend.');
        setAgentStates(prev => ({ ...prev, ocr: { ...prev.ocr, status: 'running', progress: { step: 'Enviando arquivos...', current: 0, total: files.length }}}));
        try {
            const { taskId: newTaskId } = await apiClient.startAnalysis(files);
            setTaskId(newTaskId); // Dispara o useEffect de polling
        } catch(err) {
            const errorMessage = getDetailedErrorMessage(err);
            setError(errorMessage);
            setPipelineError(true);
            setIsPipelineComplete(true);
            setAgentStates(initialAgentStates);
        }
    }, [reset]);

    const handleSendMessage = useCallback(async (message: string) => {
        if (!chatSessionIdRef.current) {
            setError('A sessão de chat não foi inicializada pelo backend.');
            return;
        }

        const userMessage: ChatMessage = { id: Date.now().toString(), sender: 'user', text: message };
        setMessages(prev => [...prev, userMessage]);
        setIsStreaming(true);

        try {
            const aiResponse = await apiClient.sendMessageToChat(chatSessionIdRef.current, message);
            setMessages(prev => [...prev, aiResponse]);
        } catch (err) {
            const finalMessage = getDetailedErrorMessage(err);
            setError(finalMessage);
        } finally {
            setIsStreaming(false);
        }
    }, []);

    const handleClassificationChange = useCallback(async (docName: string, newClassification: ClassificationResult['operationType']) => {
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

        if (!taskId) {
            setError('Não é possível salvar a correção no backend: ID da análise não encontrado.');
            return;
        }
        try {
            await apiClient.updateClassification(taskId, docName, newClassification);
            logger.log('Orchestrator', 'INFO', `Correção para '${docName}' enviada ao backend com sucesso.`);
        } catch (err) {
            const errorMessage = getDetailedErrorMessage(err);
            setError(`Falha ao salvar a correção no backend: ${errorMessage}`);
        }
    }, [classificationCorrections, taskId]);

    // A função de parar streaming não é mais aplicável neste modelo de request/response
    const handleStopStreaming = useCallback(() => {
        logger.log('Orchestrator', 'WARN', 'A parada de streaming não é suportada na arquitetura de backend.');
    }, []);

    return {
        agentStates,
        auditReport,
        setAuditReport,
        messages,
        isStreaming,
        error: error,
        isPipelineRunning: !!taskId && !isPipelineComplete,
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
