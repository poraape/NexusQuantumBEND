import React, { useState, useCallback } from 'react';
import { ClipboardIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon } from './icons';

interface CodeBlockProps {
  language: string;
  code: string;
}

const highlightJsonSyntax = (jsonString: string) => {
    return jsonString
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"([^"]+)":/g, '<span class="token-key">"$1"</span>:')
        .replace(/"((?:\\.|[^"\\])*)"/g, (match, content) => {
            if (match.endsWith('":')) return match; // Avoid re-coloring keys
            return `<span class="token-string">"${content}"</span>`;
        })
        .replace(/\b(true|false)\b/g, '<span class="token-boolean">$1</span>')
        .replace(/\b(null)\b/g, '<span class="token-null">$1</span>')
        .replace(/(\d+\.?\d*)/g, '<span class="token-number">$1</span>');
};

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [hasCopied, setHasCopied] = useState(false);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(code).then(() => {
            setHasCopied(true);
            setTimeout(() => setHasCopied(false), 2000);
        });
    }, [code]);
    
    const highlightedCode = language.toLowerCase() === 'json'
        ? highlightJsonSyntax(code)
        : code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return (
        <div className="code-block">
            <div className="code-block-header">
                <span>{language}</span>
                <div className="flex items-center gap-2">
                    <button onClick={handleCopy} title="Copiar código">
                        {hasCopied ? <CheckIcon className="w-4 h-4 text-teal-400" /> : <ClipboardIcon className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setIsExpanded(!isExpanded)} title={isExpanded ? "Recolher" : "Expandir"}>
                        {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                    </button>
                </div>
            </div>
            {isExpanded && (
                <pre>
                    <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
                </pre>
            )}
        </div>
    );
};

export default CodeBlock;