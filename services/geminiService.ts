import { GoogleGenAI, Chat, Type } from "@google/genai";
import { logger } from "./logger";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

/**
 * Generates content from the Gemini model with a specified JSON schema for the response.
 * @param model The Gemini model to use (e.g., 'gemini-2.5-flash').
 * @param prompt The user prompt.
 * @param schema The JSON schema for the expected response.
 * @returns A promise that resolves to the parsed JSON object.
 */
export async function generateJSON<T = any>(
    model: string,
    prompt: string,
    schema: ResponseSchema
): Promise<T> {
    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: schema as any, // Cast to any to satisfy the SDK's broader type
            },
        });
        
        const text = response.text;
        if (!text) {
             throw new Error("A IA retornou uma resposta vazia.");
        }
        
        return JSON.parse(text) as T;

    } catch (e) {
        logger.log('geminiService', 'ERROR', `Falha na geração de JSON com o modelo ${model}.`, { error: e });
        console.error("Gemini JSON generation failed:", e);
        if (e instanceof Error && e.message.includes('json')) {
             throw new Error('A resposta da IA não estava em um formato JSON válido.');
        }
        throw new Error('Ocorreu um erro na comunicação com a IA.');
    }
}

/**
 * Creates a new chat session with a system instruction and a JSON schema for responses.
 * @param model The Gemini model to use.
 * @param systemInstruction The system-level instructions for the chat bot.
 * @param schema The JSON schema for all chat responses.
 * @returns A Chat instance.
 */
export function createChatSession(
    model: string,
    systemInstruction: string,
    schema: ResponseSchema
): Chat {
    return ai.chats.create({
        model,
        config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: schema as any, // Cast to any to satisfy the SDK's broader type
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