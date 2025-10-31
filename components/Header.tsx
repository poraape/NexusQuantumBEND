import React from 'react';
import LogoIcon from './LogoIcon';
import type { AuditReport, ChatMessage } from '../types';
import { exportReportToHtml } from '../utils/exportReport';
import { HomeIcon } from './icons';

interface HeaderProps {
    onShowLogs: () => void;
    onReset: () => void;
    isAnalysisComplete: boolean;
    auditReport: AuditReport | null;
    messages: ChatMessage[];
}

const Header: React.FC<HeaderProps> = ({ onShowLogs, onReset, isAnalysisComplete, auditReport, messages }) => (
    <header className="bg-gray-900/50 backdrop-blur-sm p-4 flex justify-between items-center border-b border-gray-700/50 sticky top-0 z-30">
        <div 
            className="flex items-center gap-3 cursor-pointer group" 
            onClick={onReset} 
            title="Voltar ao início - Nexus Quantum I2A2" 
            aria-label="Voltar ao início - Nexus Quantum I2A2"
        >
            <LogoIcon className="w-10 h-10 group-hover:animate-pulse" />
            <div>
                <h1 className="text-xl font-bold text-gray-100 group-hover:text-teal-400 transition-colors">Nexus QuantumI2A2</h1>
                <p className="text-xs text-gray-400">Plataforma de Análise Fiscal Inteligente</p>
            </div>
            <HomeIcon className="w-5 h-5 text-gray-400 group-hover:text-teal-400 transition-colors" />
        </div>
        <div className="flex items-center gap-3">
             <button
                onClick={onShowLogs}
                className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-md transition-colors"
             >
                Ver Logs
             </button>
             {isAnalysisComplete && auditReport && (
                <button
                    onClick={() => exportReportToHtml({ report: auditReport, messages })}
                    className="text-xs bg-green-600 hover:bg-green-500 text-white font-semibold px-3 py-1.5 rounded-md transition-colors"
                >
                    Exportar Relatório
                </button>
             )}
             {isAnalysisComplete && (
                <button
                    onClick={onReset}
                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-md transition-colors"
                >
                    Nova Análise
                </button>
             )}
        </div>
    </header>
);

export default Header;
