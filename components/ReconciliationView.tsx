import React, { useState } from 'react';
import type { ReconciliationResult } from '../types';
import { FileIcon } from './icons';
import dayjs from 'dayjs';

interface ReconciliationViewProps {
    result: ReconciliationResult;
}

const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ReconciliationView: React.FC<ReconciliationViewProps> = ({ result }) => {
    const [activeTab, setActiveTab] = useState<'matched' | 'unmatchedDocs' | 'unmatchedTrans'>('matched');

    const tabStyles = "py-2 px-4 text-sm font-semibold transition-colors rounded-t-md";
    const activeTabStyles = "bg-gray-700 text-white";
    const inactiveTabStyles = "bg-gray-800 text-gray-400 hover:bg-gray-700/50";

    const renderContent = () => {
        switch (activeTab) {
            case 'matched':
                return (
                    <div className="max-h-96 overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 sticky top-0">
                                <tr>
                                    <th scope="col" className="px-4 py-2">Documento Fiscal</th>
                                    <th scope="col" className="px-4 py-2 text-right">Valor NFe</th>
                                    <th scope="col" className="px-4 py-2">Transação Bancária</th>
                                    <th scope="col" className="px-4 py-2 text-right">Valor Transação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.matchedPairs.map(({ doc, transaction }, i) => (
                                    <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-600/20">
                                        <td className="px-4 py-2 text-gray-300 truncate max-w-xs">{doc.doc.name}</td>
                                        <td className="px-4 py-2 text-right font-mono text-green-400">{formatCurrency(parseFloat(doc.doc.data?.[0]?.valor_total_nfe || 0))}</td>
                                        <td className="px-4 py-2 text-gray-300 truncate max-w-xs">{transaction.description}</td>
                                        <td className="px-4 py-2 text-right font-mono text-green-400">{formatCurrency(transaction.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            case 'unmatchedDocs':
                 return (
                    <div className="max-h-96 overflow-y-auto">
                        <table className="w-full text-sm text-left">
                             <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 sticky top-0">
                                <tr>
                                    <th scope="col" className="px-4 py-2">Documento Fiscal Pendente</th>
                                    <th scope="col" className="px-4 py-2">Data Emissão</th>
                                    <th scope="col" className="px-4 py-2 text-right">Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.unmatchedDocuments.map((doc, i) => (
                                    <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-600/20">
                                        <td className="px-4 py-2 text-gray-300 truncate max-w-xs">{doc.doc.name}</td>
                                        <td className="px-4 py-2 text-gray-400">{dayjs(doc.doc.data?.[0]?.data_emissao).format('DD/MM/YYYY')}</td>
                                        <td className="px-4 py-2 text-right font-mono text-yellow-300">{formatCurrency(parseFloat(doc.doc.data?.[0]?.valor_total_nfe || 0))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            case 'unmatchedTrans':
                return (
                    <div className="max-h-96 overflow-y-auto">
                        <table className="w-full text-sm text-left">
                             <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 sticky top-0">
                                <tr>
                                    <th scope="col" className="px-4 py-2">Descrição da Transação</th>
                                    <th scope="col" className="px-4 py-2">Data</th>
                                    <th scope="col" className="px-4 py-2 text-right">Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.unmatchedTransactions.map((trans, i) => (
                                    <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-600/20">
                                        <td className="px-4 py-2 text-gray-300 truncate max-w-xs">{trans.description}</td>
                                        <td className="px-4 py-2 text-gray-400">{dayjs(trans.date).format('DD/MM/YYYY')}</td>
                                        <td className="px-4 py-2 text-right font-mono text-orange-300">{formatCurrency(trans.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            default: return null;
        }
    };
    
    return (
        <div className="bg-gray-700/30 p-4 rounded-lg">
            <div className="flex border-b border-gray-700 mb-4">
                <button 
                    onClick={() => setActiveTab('matched')}
                    className={`${tabStyles} ${activeTab === 'matched' ? activeTabStyles : inactiveTabStyles}`}
                >
                    Pares Conciliados ({result.matchedPairs.length})
                </button>
                 <button 
                    onClick={() => setActiveTab('unmatchedDocs')}
                    className={`${tabStyles} ${activeTab === 'unmatchedDocs' ? activeTabStyles : inactiveTabStyles}`}
                >
                    Documentos Pendentes ({result.unmatchedDocuments.length})
                </button>
                 <button 
                    onClick={() => setActiveTab('unmatchedTrans')}
                    className={`${tabStyles} ${activeTab === 'unmatchedTrans' ? activeTabStyles : inactiveTabStyles}`}
                >
                    Lançamentos Não Identificados ({result.unmatchedTransactions.length})
                </button>
            </div>
            {renderContent()}
        </div>
    )
};

export default ReconciliationView;