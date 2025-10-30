import React, { useState, useRef, useEffect, useCallback } from 'react';
// FIX: Corrected import path for ExportType.
import type { ChatMessage, AuditReport, ExportType } from '../types';
import { SendIcon, LoadingSpinnerIcon, StopIcon, DownloadIcon, DocumentTextIcon, PaperClipIcon } from './icons';
import { exportConversationToDocx, exportConversationToHtml, exportConversationToPdf } from '../utils/exportConversationUtils';
import ChatMessageContent from './ChatMessageContent';
import { generateSuggestedQuestions } from '../services/geminiService';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isStreaming: boolean;
  onStopStreaming: () => void;
  report: AuditReport;
  setError: (message: string | null) => void;
  onAddFiles: (files: File[]) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ messages, onSendMessage, isStreaming, onStopStreaming, report, setError, onAddFiles }) => {
  const [input, setInput] = useState('');
  const [isExporting, setIsExporting] = useState<ExportType | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([
    "Qual foi o produto com o maior valor total?",
    "Resuma as principais inconsistências encontradas.",
    "Liste os 5 principais produtos por quantidade.",
    "Existe alguma oportunidade de otimização fiscal nos dados?",
  ]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  // Efeito para gerar sugestões dinâmicas
  useEffect(() => {
    const generateSuggestions = async () => {
        if (isStreaming || isGeneratingSuggestions || messages.length < 2 || messages[messages.length - 1].sender !== 'ai') {
            return;
        }

        setIsGeneratingSuggestions(true);
        try {
            const lastMessages = messages.slice(-2).map(m => ({ sender: m.sender, text: m.text }));
            const newSuggestions = await generateSuggestedQuestions(lastMessages, report.summary);
            
            if (newSuggestions && newSuggestions.length > 0) {
                setSuggestedQuestions(newSuggestions);
            }
        } catch (error) {
            console.error("Failed to generate dynamic suggestions:", error);
            // Silently fail, keep old suggestions
        } finally {
            setIsGeneratingSuggestions(false);
        }
    };

    generateSuggestions();
  }, [messages, isStreaming, report, isGeneratingSuggestions]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isStreaming) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        onAddFiles(Array.from(e.target.files));
        e.target.value = '';
    }
  };
  
  const handleExport = async (type: ExportType) => {
    setIsExporting(type);
    setShowExportMenu(false);
    try {
        const filename = `Conversa_Analise_Fiscal_${report.summary.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
        const title = `Conversa sobre: ${report.summary.title}`;

        switch(type) {
            case 'docx': await exportConversationToDocx(messages, title, filename); break;
            case 'html': await exportConversationToHtml(messages, title, filename); break;
            case 'pdf': await exportConversationToPdf(messages, title, filename); break;
        }

    } catch(err) {
        console.error(`Failed to export conversation as ${type}:`, err);
        setError(`Falha ao exportar a conversa como ${type.toUpperCase()}.`);
    } finally {
        setIsExporting(null);
    }
  };

  const exportOptions: { type: ExportType, label: string, icon: React.ReactNode }[] = [
      { type: 'docx', label: 'DOCX', icon: <DocumentTextIcon className="w-4 h-4" /> },
      { type: 'html', label: 'HTML', icon: <span className="font-bold text-sm">H</span> },
      { type: 'pdf', label: 'PDF', icon: <span className="font-bold text-sm">P</span> },
  ];

  const handleSuggestionClick = useCallback((question: string) => {
      setInput(question);
      chatInputRef.current?.focus();
  }, []);

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg flex flex-col h-full max-h-[calc(100vh-12rem)] animate-fade-in">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-200">Chat Interativo</h2>
        <div className="relative" ref={exportMenuRef}>
            <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={!!isExporting}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2 text-sm"
                title="Exportar Conversa"
            >
                <DownloadIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Exportar Conversa</span>
            </button>
            {showExportMenu && (
                <div className="absolute top-full right-0 mt-2 w-40 bg-gray-700 rounded-md shadow-lg z-10 animate-fade-in-down-sm">
                    {exportOptions.map(({ type, label, icon }) => (
                         <button
                            key={type}
                            onClick={() => handleExport(type)}
                            disabled={!!isExporting}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-600 disabled:opacity-50"
                        >
                            {isExporting === type ? <LoadingSpinnerIcon className="w-4 h-4 animate-spin"/> : icon}
                            <span>{label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
      </div>
      <div className="flex-grow p-4 overflow-y-auto space-y-4">
        {messages.map((message) => (
          <ChatMessageContent key={message.id} message={message} isStreaming={isStreaming && message.id === messages[messages.length - 1].id} />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t border-gray-700">
        {messages.length > 1 && !isStreaming && suggestedQuestions.length > 0 && (
            <div className="mb-3 text-center animate-fade-in">
                <p className="text-xs text-gray-500 mb-2">Sugestões de Análise:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                    {suggestedQuestions.map((q, i) => (
                        <button
                            key={i}
                            onClick={() => handleSuggestionClick(q)}
                            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded-full transition-colors"
                        >
                            {q}
                        </button>
                    ))}
                </div>
            </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            accept=".xml,.csv,.xlsx,.pdf,.png,.jpeg,.jpg,.zip"
            onChange={handleFileChange}
            disabled={isStreaming}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            className="p-2.5 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Adicionar mais arquivos à análise"
          >
            <PaperClipIcon className="w-5 h-5" />
          </button>
          <input
            ref={chatInputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isStreaming ? "Aguardando resposta do backend..." : "Faça uma pergunta ou adicione arquivos..."}
            disabled={isStreaming}
            className="flex-grow bg-gray-700 rounded-full py-2 px-4 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow disabled:opacity-50"
          />
          <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              className="bg-blue-600 hover:bg-blue-500 text-white rounded-full p-2.5 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed w-10 h-10 flex items-center justify-center"
          >
              {isStreaming ? <LoadingSpinnerIcon className="w-5 h-5 animate-spin" /> : <SendIcon className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatPanel;