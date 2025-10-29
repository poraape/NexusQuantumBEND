// services/apiClient.ts
import type { AgentStates, AuditReport, ChatMessage, ClassificationResult } from '../types';
import { logger } from './logger';

const BASE_URL = 'http://localhost:8000';

/**
 * A wrapper around fetch for making API calls to the backend.
 * Handles common tasks like setting headers, checking for errors, and parsing JSON.
 * @param url The full URL for the request.
 * @param options The standard fetch options object.
 * @returns The JSON response from the API.
 */
async function apiFetch(url: string, options: RequestInit = {}): Promise<any> {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Accept': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                throw new Error(response.statusText || `Erro de rede: ${response.status}`);
            }
            const errorMessage = errorData.detail || JSON.stringify(errorData) || response.statusText;
            throw new Error(errorMessage);
        }

        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return null;
        }

        return await response.json();
    } catch (error) {
        logger.log('ApiClient', 'ERROR', `Falha na requisição para ${url}`, { error });
        // Re-throw the error so it can be caught by the calling function (e.g., in the orchestrator hook)
        throw error;
    }
}


class ApiClient {
    async startAnalysis(files: File[]): Promise<{ taskId: string }> {
        logger.log('ApiClient', 'INFO', `Iniciando análise para ${files.length} arquivos via backend.`);
        const formData = new FormData();
        files.forEach(file => {
            // The backend expects a list of files under the key 'files'
            formData.append('files', file);
        });

        // For FormData, the browser sets the 'Content-Type' with the correct boundary.
        // Do not set it manually.
        return apiFetch(`${BASE_URL}/analysis`, {
            method: 'POST',
            body: formData,
        });
    }

    async getAnalysisStatus(taskId: string): Promise<{ status: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'ERROR', progress: AgentStates, reportUrl?: string, error?: string }> {
        // No logging here to avoid flooding logs during polling
        return apiFetch(`${BASE_URL}/analysis/${taskId}/status`);
    }
    
    async getAnalysisReport(reportUrl: string): Promise<AuditReport> {
        // The reportUrl from the status endpoint might be a relative path (e.g., /api/reports/task-...)
        const fullUrl = reportUrl.startsWith('http') ? reportUrl : `${BASE_URL}${reportUrl}`;
        logger.log('ApiClient', 'INFO', `Buscando relatório de ${fullUrl}.`);
        return apiFetch(fullUrl);
    }

    async startChatSession(report: AuditReport): Promise<{ sessionId: string }> {
        logger.log('ApiClient', 'INFO', `Iniciando sessão de chat para o relatório "${report.summary.title}".`);
        return apiFetch(`${BASE_URL}/chat/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(report),
        });
    }

    async sendMessageToChat(sessionId: string, message: string): Promise<ChatMessage> {
        logger.log('ApiClient', 'INFO', `Enviando mensagem para a sessão ${sessionId}: "${message}"`);
        return apiFetch(`${BASE_URL}/chat/${sessionId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Assuming the backend expects a simple object with a 'message' key
            body: JSON.stringify({ message }),
        });
    }

    async updateClassification(taskId: string, docName: string, newClassification: ClassificationResult['operationType']): Promise<{ success: boolean }> {
        logger.log('ApiClient', 'INFO', `Atualizando classificação para ${docName} para ${newClassification} na task ${taskId}.`);
        // Assuming snake_case for Python backend
        return apiFetch(`${BASE_URL}/analysis/${taskId}/classification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doc_name: docName, new_classification: newClassification }),
        });
    }
}

// Export a singleton instance of the real API client
export const apiClient = new ApiClient();
