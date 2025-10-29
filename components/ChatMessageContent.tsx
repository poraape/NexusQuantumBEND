import React from 'react';
import type { ChatMessage } from '../types';
import { UserIcon, AiIcon, LoadingSpinnerIcon } from './icons';
import Chart from './Chart';
import CodeBlock from './CodeBlock';

interface ChatMessageContentProps {
  message: ChatMessage;
  isStreaming: boolean;
}

const parseMarkdown = (text: string) => {
  const parts = text.split(/(\`\`\`[\s\S]*?\`\`\`)/g);
  return parts.map((part, index) => {
    const codeBlockMatch = part.match(/\`\`\`(\w+)?\n([\s\S]+)\`\`\`/);
    if (codeBlockMatch) {
      const [, language, code] = codeBlockMatch;
      return <CodeBlock key={index} language={language || 'text'} code={code.trim()} />;
    }
    
    const html = part
      .replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>') // Bold
      .replace(/(\*|_)(.*?)\1/g, '<em>$2</em>') // Italics
      .replace(/`([^`]+)`/g, '<code class="bg-gray-900/50 text-orange-300 rounded px-1 py-0.5 font-mono text-sm">$1</code>') // Inline code
      .replace(/^\s*\* (.*?)$/gm, '<li class="ml-4 list-disc">$1</li>') // Unordered lists
      .replace(/^\s*\d+\.\s(.*?)$/gm, '<li class="ml-4 list-decimal">$1</li>') // Ordered lists
      // Handle tables
      .replace(/\|(.+)\|/g, (match, row) => {
        const cells = row.split('|').map(c => c.trim());
        return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
      })
      .replace(/(<tr>.*<\/tr>)/gs, (match, rows) => {
        const firstRowIsHeader = rows.includes('---');
        if(firstRowIsHeader) {
            const tableRows = rows.replace(/\|-.*-\|/g, '').split('</tr>').filter(r => r.trim());
            const header = tableRows[0].replace(/<td>/g, '<th>');
            const body = tableRows.slice(1).join('</tr>');
            return `<table class="table-auto w-full my-2 text-left"><thead>${header}</thead><tbody>${body}</tbody></table>`;
        }
        return `<table class="table-auto w-full my-2 text-left"><tbody>${rows}</tbody></table>`;
      });
      
    const finalHtml = html.replace(/<\/li>\s*<li/g, '</li><li');

    return <div key={index} dangerouslySetInnerHTML={{ __html: finalHtml.replace(/\n/g, '<br />') }} />;
  });
};

const ChatMessageContent: React.FC<ChatMessageContentProps> = ({ message, isStreaming }) => {
  return (
    <div className={`flex items-start gap-3 ${message.sender === 'user' ? 'justify-end' : ''}`}>
      {message.sender === 'ai' && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center flex-shrink-0">
          <AiIcon className="w-5 h-5 text-white" />
        </div>
      )}
      <div className={`max-w-xl p-3 rounded-lg ${
          message.sender === 'user'
            ? 'bg-blue-600 text-white rounded-br-none'
            : 'bg-gray-700 text-gray-200 rounded-bl-none'
        }`}>
        <div className="prose prose-sm prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-table:my-2 prose-th:px-2 prose-th:py-1 prose-th:border prose-th:border-gray-600 prose-td:px-2 prose-td:py-1 prose-td:border prose-td:border-gray-600">
           {isStreaming ? <LoadingSpinnerIcon className="w-5 h-5 animate-spin" /> : parseMarkdown(message.text)}
        </div>
        {message.chartData && (
          <div className="mt-4 bg-gray-800/50 p-4 rounded-md" data-chart-container="true">
            <Chart {...message.chartData} />
          </div>
        )}
      </div>
       {message.sender === 'user' && (
        <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
          <UserIcon className="w-5 h-5 text-gray-300" />
        </div>
      )}
    </div>
  );
};

export default ChatMessageContent;