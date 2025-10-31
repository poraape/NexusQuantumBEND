import { GoogleGenAI, Chat, Type } from "@google/genai";
import { logger } from "./logger";

let aiClient: GoogleGenAI | null = null;

const resolveApiKey = (): string => {
    const key = import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) {
        const message = 'A variável de ambiente VITE_GEMINI_API_KEY não foi configurada. Defina-a antes de executar a análise.';
        logger.log('geminiService', 'ERROR', message);
        throw new Error(message);
    }
    return key;
};

const getClient = (): GoogleGenAI => {
    if (!aiClient) {
        const apiKey = resolveApiKey();
        aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
};

// A type for the schema definition to avoid using `any`
export type ResponseSchema = {
    type: Type;
    properties?: Record<string, any>;
    items?: Record<string, any>;
    required?: string[];
    description?: string;
    enum?: string[];
    nullable?: boolean;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


/**
 * Generates content from the Gemini model with a specified JSON schema for the response.
 * Includes retry logic with exponential backoff for rate limiting errors.
 * @param model The Gemini model to use (e.g., 'gemini-2.5-flash').
 * @param prompt The user prompt.
 * @param schema The JSON schema for the expected response.
 * @returns A promise that resolves to the parsed JSON object.
 */
export async function generateJSON<T = any>(
    model: string,
    prompt: string,
    schema: ResponseSchema,
    maxRetries = 3
): Promise<T> {
    let attempt = 0;
    let lastResponseText: string | null = null;
    while(attempt <= maxRetries) {
        lastResponseText = null;
        try {
            const client = getClient();
            const response = await client.models.generateContent({
                model: model,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema as any, // Cast to any to satisfy the SDK's broader type
                    maxOutputTokens: 8192,
                },
            });
            
            const text = response.text;
            if (!text) {
                 throw new Error("A IA retornou uma resposta vazia.");
            }

            // Clean up potential markdown wrappers from the response text
            const cleanedText = text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
            lastResponseText = cleanedText;
            return JSON.parse(cleanedText) as T;

        } catch (e) {
            const errorString = e instanceof Error ? e.message : String(e);
            logger.log('geminiService', 'WARN', `Tentativa ${attempt + 1} de geração de JSON falhou.`, { error: errorString });
            
            const isRateLimitError = errorString.includes('429') || 
                                     errorString.toLowerCase().includes('quota') || 
                                     errorString.toLowerCase().includes('resource has been exhausted');

            if (isRateLimitError && attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                logger.log('geminiService', 'INFO', `Limite de taxa atingido. Tentando novamente em ${Math.round(delay / 1000)}s.`);
                await sleep(delay);
                attempt++;
            } else if (isRateLimitError) {
                logger.log('geminiService', 'ERROR', `Máximo de tentativas de limite de taxa atingido.`);
                throw new Error('Cota da API excedida. Por favor, tente novamente mais tarde.');
            } else {
                 logger.log('geminiService', 'ERROR', `Falha na geração de JSON com o modelo ${model}.`, {
                     error: e,
                     rawResponse: lastResponseText,
                 });
                 if (e instanceof SyntaxError) {
                     // Pass the malformed text in the error for better debugging
                     throw new SyntaxError(`A resposta da IA não era um JSON válido: ${e.message}`);
                 }
                 throw new Error('Ocorreu um erro na comunicação com a IA.');
            }
        }
    }
    // This line should be unreachable if the logic is correct.
    throw new Error('Falha na geração de JSON após múltiplas tentativas.');
}


/**
 * Creates a new chat session with a system instruction and a JSON schema for responses.
 * @param model The Gemini model to use.
 * @param systemInstruction The system-level instructions for the chat bot.
 * @param schema The JSON schema for all chat responses.
 * @param history Optional initial chat history.
 * @returns A Chat instance.
 */
export function createChatSession(
    model: string,
    systemInstruction: string,
    schema: ResponseSchema,
    history?: any[]
): Chat {
    const client = getClient();
    return client.chats.create({
        model,
        history,
        config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: schema as any, // Cast to any to satisfy the SDK's broader type
            maxOutputTokens: 8192,
        },
    });
}

/**
 * Sends a message in a chat and streams the response.
 * @param chat The Chat instance.
 * @param message The user's message.
 * @returns An async generator that yields text chunks of the response.
 */
export async function* streamChatMessage(chat: Chat, message: string): AsyncGenerator<string> {
    if (!chat) {
        throw new Error('Chat not initialized.');
    }

    try {
        const stream = await chat.sendMessageStream({ message });
        for await (const chunk of stream) {
            yield chunk.text;
        }
    } catch (e) {
        logger.log('geminiService', 'ERROR', 'Falha durante o streaming da resposta do chat.', { error: e });
        console.error('Error during streaming chat:', e);
        throw new Error('Desculpe, ocorreu um erro ao processar sua solicitação de chat.');
    }
}


const suggestionSchema = {
    type: Type.OBJECT,
    properties: {
        questions: {
            type: Type.ARRAY,
            description: "Um array de 3-4 perguntas sugeridas.",
            items: { type: Type.STRING }
        }
    },
    required: ['questions']
};


export async function generateSuggestedQuestions(
    conversationHistory: { sender: string, text: string }[],
    reportSummary: any
): Promise<string[]> {
    const historyText = conversationHistory
        .map(m => `${m.sender === 'user' ? 'Usuário' : 'IA'}: ${m.text}`)
        .join('\n');

    const prompt = `
        Você é um assistente de IA proativo que ajuda um analista fiscal.
        Sua tarefa é gerar 3 ou 4 perguntas de acompanhamento curtas e perspicazes que o usuário poderia fazer a seguir, com base no resumo do relatório fiscal e nas últimas mensagens da conversa.
        As perguntas devem incentivar uma exploração mais profunda dos dados ou da análise da IA.
        Evite perguntas que já foram feitas. As perguntas devem ser concisas e diretas.

        **Resumo do Relatório Fiscal:**
        - Título: ${reportSummary.title}
        - Principais Métricas: ${reportSummary.keyMetrics.map((m: any) => `${m.metric}: ${m.value}`).join(', ')}
        - Principais Insights: ${reportSummary.actionableInsights.join('; ')}

        **Últimas Mensagens da Conversa:**
        ${historyText}

        Baseado neste contexto, gere as próximas perguntas.
        Retorne sua resposta como um objeto JSON com uma única chave "questions" contendo um array de strings.
        Garanta que qualquer aspas duplas dentro das strings de perguntas sejam devidamente escapadas com uma barra invertida (ex: "Qual o valor do produto \\"X\\"?").
    `;

    try {
        const result = await generateJSON<{ questions: string[] }>(
            'gemini-2.5-flash',
            prompt,
            suggestionSchema
        );
        return result.questions || [];
    } catch (e) {
        logger.log('geminiService', 'WARN', 'Falha ao gerar sugestões de perguntas. Retornando array vazio.', { error: e });
        return [];
    }
}