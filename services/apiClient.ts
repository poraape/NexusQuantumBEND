// services/apiClient.ts
import type { AgentStates, AuditReport, ChatMessage, ClassificationResult } from '../types';
import { logger } from './logger';

const initialAgentStates: AgentStates = {
    ocr: { status: 'pending', progress: { step: 'Aguardando arquivos', current: 0, total: 0 } },
    auditor: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    classifier: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    crossValidator: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    intelligence: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    accountant: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
};

// Um relatório mock para quando o pipeline for concluído com sucesso
const MOCK_SUCCESS_REPORT: AuditReport = {
    summary: {
        title: "Análise Fiscal Simulada (Backend)",
        summary: "Esta análise foi gerada por um backend simulado para demonstrar a nova arquitetura cliente-servidor. A orquestração e o processamento pesado agora ocorrem no servidor, garantindo escalabilidade e segurança.",
        keyMetrics: [
            { metric: "Documentos Válidos", value: "1 (Mock)", insight: "Processado com sucesso via API." },
            { metric: "Valor Total das NFes", value: "R$ 352.046,81", insight: "Calculado de forma robusta no backend." },
            { metric: "Inconsistências Graves", value: "2 (Mock)", insight: "Detectadas pelo motor de regras do servidor." }
        ],
        actionableInsights: ["A migração para o backend foi um sucesso, desbloqueando análises mais complexas.", "Monitore a latência da API para garantir a performance e a experiência do usuário."],
        strategicRecommendations: ["Evoluir os microserviços dos agentes de forma independente para facilitar a manutenção.", "Implementar um dashboard de monitoramento para a saúde dos workers do backend."]
    },
    documents: [], // Em um caso real, os documentos auditados seriam incluídos aqui
    aggregatedMetrics: { 'Valor Total das NFes': "R$ 352.046,81" },
};


class MockApiClient {
    private taskId: string | null = null;
    private startTime: number | null = null;
    private readonly pipelineDuration = 8000; // 8 segundos de duração total do pipeline

    async startAnalysis(files: File[]): Promise<{ taskId: string }> {
        logger.log('ApiClient', 'INFO', `[MOCK] Iniciando análise para ${files.length} arquivos.`);
        this.taskId = `task-${Date.now()}`;
        this.startTime = Date.now();
        return new Promise(resolve => {
            setTimeout(() => resolve({ taskId: this.taskId! }), 500); // Simula a latência do upload
        });
    }

    async getAnalysisStatus(taskId: string): Promise<{ status: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'ERROR', progress: AgentStates, reportUrl?: string, error?: string }> {
        if (taskId !== this.taskId || !this.startTime) {
            const errorMsg = 'Task ID inválido ou não iniciado.';
            logger.log('ApiClient', 'ERROR', `[MOCK] ${errorMsg}`);
            // FIX: The consuming code expects a resolved promise with an error status, not a rejected promise.
            // Changed from Promise.reject to Promise.resolve and provided the full object required by the type signature.
            return Promise.resolve({
                status: 'ERROR',
                progress: initialAgentStates,
                error: errorMsg
            });
        }

        const elapsedTime = Date.now() - this.startTime;
        const progressPercentage = Math.min(elapsedTime / this.pipelineDuration, 1);
        
        const agentSteps: (keyof AgentStates)[] = ['ocr', 'auditor', 'classifier', 'crossValidator', 'intelligence', 'accountant'];
        const currentStepIndex = Math.floor(progressPercentage * agentSteps.length);

        const newProgress: AgentStates = JSON.parse(JSON.stringify(initialAgentStates));

        for (let i = 0; i < agentSteps.length; i++) {
            const agentName = agentSteps[i];
            if (i < currentStepIndex) {
                newProgress[agentName].status = 'completed';
            } else if (i === currentStepIndex && progressPercentage < 1) {
                newProgress[agentName].status = 'running';
                newProgress[agentName].progress = { step: `Processando no backend...`, current: 1, total: 1 };
            } else {
                 newProgress[agentName].status = 'pending';
            }
        }
        
        if (progressPercentage >= 1) {
             logger.log('ApiClient', 'INFO', `[MOCK] Análise ${taskId} concluída.`);
             Object.values(newProgress).forEach(s => s.status = 'completed');
             return Promise.resolve({
                 status: 'COMPLETE',
                 progress: newProgress,
                 reportUrl: `/api/reports/${taskId}`
             });
        }

        return Promise.resolve({
            status: 'PROCESSING',
            progress: newProgress,
        });
    }
    
    async getAnalysisReport(reportUrl: string): Promise<AuditReport> {
        logger.log('ApiClient', 'INFO', `[MOCK] Buscando relatório de ${reportUrl}.`);
        return new Promise(resolve => {
            setTimeout(() => resolve(MOCK_SUCCESS_REPORT), 300); // Simula latência de busca
        });
    }

    async startChatSession(report: AuditReport): Promise<{ sessionId: string }> {
        logger.log('ApiClient', 'INFO', `[MOCK] Iniciando sessão de chat para o relatório "${report.summary.title}".`);
        return Promise.resolve({ sessionId: `session-${Date.now()}` });
    }

    async sendMessageToChat(sessionId: string, message: string): Promise<ChatMessage> {
        logger.log('ApiClient', 'INFO', `[MOCK] Enviando mensagem para a sessão ${sessionId}: "${message}"`);
        
        let responseText = `Esta é uma resposta simulada do backend para a sua pergunta: "${message}". A lógica real da IA agora reside no servidor.`;
        if (message.toLowerCase().includes('produto')) {
            responseText = "Resposta do backend: O produto com maior valor foi o 'PROCESSADOR QUÂNTICO I2A2', conforme calculado pelo nosso serviço de análise de dados."
        }
        
        const mockResponse: ChatMessage = {
            id: `ai-${Date.now()}`,
            sender: 'ai',
            text: responseText
        };

        return new Promise(resolve => {
            setTimeout(() => resolve(mockResponse), 1500 + Math.random() * 1000); // Simula latência da rede e da IA
        });
    }

    async updateClassification(taskId: string, docName: string, newClassification: ClassificationResult['operationType']): Promise<{ success: boolean }> {
        logger.log('ApiClient', 'INFO', `[MOCK] Atualizando classificação para ${docName} para ${newClassification} na task ${taskId}.`);
        return new Promise(resolve => {
            setTimeout(() => resolve({ success: true }), 250); // Simula latência da API
        });
    }
}

export const apiClient = new MockApiClient();