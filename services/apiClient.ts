
// services/apiClient.ts
import type { AgentStates, AuditReport, ChatMessage, ClassificationResult } from '../types';
import { logger } from './logger';

const API_BASE_URL = 'http://localhost:8000/api/v1';

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
    authToken = token;
};

class ApiClient {
    private getHeaders(isFormData: boolean = false): HeadersInit {
        const headers: HeadersInit = {};
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        if (!isFormData) {
            headers['Content-Type'] = 'application/json';
        }
        return headers;
    }

    async login(username: string, password: string): Promise<{ access_token: string }> {
        logger.log('ApiClient', 'INFO', `Tentando login para o usuário ${username}.`);
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch(`${API_BASE_URL}/auth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString(),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Erro de autenticação desconhecido' }));
            throw new Error(errorData.detail || 'Falha no login.');
        }
        return response.json();
    }

    async startAnalysis(files: File[]): Promise<{ taskId: string }> {
        logger.log('ApiClient', 'INFO', `Iniciando análise para ${files.length} arquivos.`);
        
        const formData = new FormData();
        files.forEach(file => {
            formData.append('files', file, file.name);
        });

        try {
            const response = await fetch(`${API_BASE_URL}/upload/`, {
                method: 'POST',
                headers: this.getHeaders(true),
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Falha no upload do arquivo.');
            }

            const result = await response.json();
            const taskId = `task-${Date.now()}`;
            sessionStorage.setItem(taskId, JSON.stringify(result));
            return { taskId };

        } catch (error) {
            logger.log('ApiClient', 'ERROR', 'Erro ao iniciar a análise:', error);
            throw error;
        }
    }

    async getAnalysisStatus(taskId: string): Promise<{ status: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'ERROR', progress: AgentStates, reportUrl?: string, error?: string }> {
        const result = sessionStorage.getItem(taskId);
        if (!result) {
            return Promise.resolve({ status: 'ERROR', progress: initialAgentStates, error: 'Task ID inválido ou não encontrado.' });
        }
        
        const finalProgress = { ...initialAgentStates };
        for (const key in finalProgress) {
            finalProgress[key as keyof AgentStates].status = 'completed';
        }

        return Promise.resolve({
            status: 'COMPLETE',
            progress: finalProgress,
            reportUrl: `/api/reports/${taskId}`
        });
    }
    
    async getAnalysisReport(reportUrl: string): Promise<AuditReport> {
        const taskId = reportUrl.split('/').pop();
        if (!taskId) throw new Error("ID do relatório inválido.");

        const resultString = sessionStorage.getItem(taskId);
        if (!resultString) throw new Error("Dados do relatório não encontrados.");

        const result = JSON.parse(resultString);
        const report: AuditReport = {
            summary: {
                title: `Análise de ${result.filename}`,
                summary: `Arquivo processado com a codificação detectada: ${result.detected_encoding}.`,
                keyMetrics: [
                    { metric: "Nome do Arquivo", value: result.filename, insight: "O arquivo foi lido com sucesso." },
                    { metric: "Codificação Detectada", value: result.detected_encoding, insight: "Esta foi a codificação usada para decodificar o arquivo." },
                ],
                actionableInsights: ["Verifique se a codificação detectada está correta.", "Os dados abaixo são uma pré-visualização do conteúdo do arquivo."],
                strategicRecommendations: []
            },
            documents: [], 
            rawData: result.data,
            aggregatedMetrics: {},
        };
        return Promise.resolve(report);
    }

    async startChatSession(report: AuditReport): Promise<{ sessionId: string }> {
        logger.log('ApiClient', 'INFO', `[MOCK] Iniciando sessão de chat para o relatório "${report.summary.title}".`);
        return Promise.resolve({ sessionId: `session-${Date.now()}` });
    }

    async sendMessageToChat(sessionId: string, message: string): Promise<ChatMessage> {
        logger.log('ApiClient', 'INFO', `[MOCK] Enviando mensagem para a sessão ${sessionId}: "${message}"`);
        let responseText = `Esta é uma resposta simulada do backend para a sua pergunta: "${message}". A lógica real da IA agora reside no servidor.`;
        if (message.toLowerCase().includes('produto')) {
            responseText = "Resposta do backend: O produto com maior valor foi o 'PROCESSADOR QUÂNTICO I2A2', conforme calculado pelo nosso serviço de análise de dados.";
        }
        const mockResponse: ChatMessage = { id: `ai-${Date.now()}`, sender: 'ai', text: responseText };
        return new Promise(resolve => setTimeout(() => resolve(mockResponse), 1500 + Math.random() * 1000));
    }

    async updateClassification(taskId: string, docName: string, newClassification: ClassificationResult['operationType']): Promise<{ success: boolean }> {
        logger.log('ApiClient', 'INFO', `[MOCK] Atualizando classificação para ${docName} para ${newClassification} na task ${taskId}.`);
        return new Promise(resolve => setTimeout(() => resolve({ success: true }), 250));
    }
}

const initialAgentStates: AgentStates = {
    ocr: { status: 'pending', progress: { step: 'Aguardando arquivos', current: 0, total: 0 } },
    auditor: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    classifier: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    crossValidator: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    intelligence: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
    accountant: { status: 'pending', progress: { step: '', current: 0, total: 0 } },
};

export const apiClient = new ApiClient();
