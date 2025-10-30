import { Type, Chat } from "@google/genai";
import { createChatSession } from './geminiService';

const chatResponseSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING, description: "Textual response to the user's query." },
    chartData: {
      type: Type.OBJECT,
      description: "Optional: Chart data if the query can be visualized.",
      properties: {
        type: { type: Type.STRING, enum: ['bar', 'pie', 'line', 'scatter'], description: "Type of chart." },
        title: { type: Type.STRING, description: "Title of the chart." },
        data: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              value: { type: Type.NUMBER },
              x: { type: Type.NUMBER, nullable: true, description: "X-value for scatter plots." }
            },
            required: ['label', 'value'],
          },
        },
        xAxisLabel: { type: Type.STRING, nullable: true },
        yAxisLabel: { type: Type.STRING, nullable: true },
      },
      nullable: true,
    },
  },
  required: ['text'],
};

export const startChat = (dataSample: string, aggregatedMetrics?: Record<string, any>): Chat => {
  const systemInstruction = `
        You are an expert fiscal data analyst assistant. Your primary goal is to help the user explore and understand their fiscal data.
        
        Follow these rules:
        1.  Source of Truth: You MUST use the 'Aggregated Metrics' from the conversation history for questions about totals. For detailed questions, use the 'Data Sample' from the history.
        2.  Ask for Clarification: If a request is vague, ask a clarifying question.
        3.  Be Proactive: After answering, suggest a related analysis.
        4.  Generate Visualizations: If a query can be visualized, you MUST provide the chart data. Otherwise, set 'chartData' to null. Include axis labels (xAxisLabel, yAxisLabel) where appropriate.
        5.  Language and Format: Always respond in Brazilian Portuguese. Your entire response must be a single, valid JSON object, adhering to the required schema.
    `;
    
  const initialHistory = [
    {
        role: 'user',
        parts: [{ text: `
            Aqui estão os dados para nossa análise. Use-os como a principal fonte de verdade para minhas perguntas.

            Métricas Agregadas (Fonte de verdade para totais):
            ${JSON.stringify(aggregatedMetrics || { info: "Nenhuma métrica agregada calculada." }, null, 2)}
    
            Amostra de Dados de Itens (Para perguntas detalhadas):
            ${dataSample}
        `}]
    },
    {
        role: 'model',
        parts: [{ text: JSON.stringify({
            text: "Entendido. Os dados e as métricas agregadas foram carregados. Estou pronto para ajudar na sua análise fiscal. O que você gostaria de saber?",
            chartData: null
        })}]
    }
  ];

  return createChatSession(
    'gemini-2.5-flash',
    systemInstruction,
    chatResponseSchema,
    initialHistory
  );
};
