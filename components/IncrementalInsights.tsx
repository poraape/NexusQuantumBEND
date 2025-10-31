import React from 'react';
import type { AuditReport, ChartData } from '../types';
import Chart from './Chart';
import { parseSafeFloat } from '../utils/parsingUtils';

interface IncrementalInsightsProps {
    history: AuditReport[];
}

const formatCurrency = (value: number) => {
    if (isNaN(value)) return '—';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Renders a table value, showing a placeholder for null or undefined data.
 * @param value The value to render.
 * @returns A JSX element or the original value.
 */
const renderTableValue = (value: any) => {
    if (value === null || value === undefined || value === '') {
        return <span className="text-gray-500">—</span>;
    }
    return value;
};


const IncrementalInsights: React.FC<IncrementalInsightsProps> = ({ history }) => {

    if (history.length < 2) {
        return (
            <div className="bg-gray-800 p-6 rounded-lg text-center">
                <p className="text-gray-400">Envie um novo lote de arquivos para iniciar a análise comparativa.</p>
            </div>
        );
    }
    
    const chartData: ChartData = {
        type: 'bar',
        title: 'Evolucao do Valor Total das NFes por Analise',
        data: history.map((report, index) => {
            const parsedValue = parseSafeFloat(report.aggregatedMetrics?.['Valor Total das NFes']);
            return {
                label: `Analise #${index + 1}`,
                value: Number.isNaN(parsedValue) ? 0 : parsedValue,
            };
        }),
        yAxisLabel: 'Valor Total (R$)',
    };

    const lastReport = history[history.length - 1].aggregatedMetrics || {};
    const prevReport = history[history.length - 2].aggregatedMetrics || {};
    
    const metricsToCompare = ['Valor Total das NFes', 'Valor Total dos Produtos', 'Valor Total de ICMS', 'Numero de Documentos Validos'];
    const diffs: Record<string, { current: number, prev: number, delta: number }> = {};

    metricsToCompare.forEach(metric => {
        const rawCurrentVal = parseSafeFloat(lastReport[metric]);
        const rawPrevVal = parseSafeFloat(prevReport[metric]);
        const currentVal = Number.isNaN(rawCurrentVal) ? 0 : rawCurrentVal;
        const prevVal = Number.isNaN(rawPrevVal) ? 0 : rawPrevVal;

        if(currentVal > 0 || prevVal > 0) {
            diffs[metric] = {
                current: currentVal,
                prev: prevVal,
                delta: currentVal - prevVal,
            };
        }
    });

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg animate-fade-in space-y-8">
            <div>
                <h2 className="text-xl font-bold text-gray-200 mb-4">Análise Comparativa Incremental</h2>
                <div className="bg-gray-700/50 p-4 rounded-md" data-chart-container="true">
                    <Chart {...chartData} />
                </div>
            </div>

             <div>
                <h3 className="text-lg font-bold text-gray-200 mb-4">Resumo das Análises</h3>
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                         <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                            <tr>
                                <th scope="col" className="px-4 py-2">Métrica</th>
                                {history.map((_, index) => (
                                    <th key={index} scope="col" className="px-4 py-2 text-right">Análise #{index + 1}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                           {metricsToCompare.map(metric => (
                                <tr key={metric} className="border-b border-gray-700/50 hover:bg-gray-600/20">
                                    <td className="px-4 py-2 font-semibold text-gray-300">{metric}</td>
                                    {history.map((report, index) => (
                                         <td key={index} className="px-4 py-2 text-right font-mono">
                                            {renderTableValue(report.aggregatedMetrics?.[metric])}
                                         </td>
                                    ))}
                                </tr>
                           ))}
                        </tbody>
                    </table>
                 </div>
            </div>
            
            <div>
                 <h3 className="text-lg font-bold text-gray-200 mb-4">Diferenças (Última Análise vs. Anterior)</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(diffs).map(([metric, values]) => {
                        const isIncrease = values.delta > 0;
                        const isDecrease = values.delta < 0;
                        const deltaColor = isIncrease ? 'text-green-400' : isDecrease ? 'text-red-400' : 'text-gray-400';
                        const sign = isIncrease ? '+' : '';

                        return (
                            <div key={metric} className="bg-gray-700/50 p-4 rounded-md">
                                <p className="text-sm font-semibold text-gray-300">{metric}</p>
                                <p className="text-lg font-bold text-gray-200">{formatCurrency(values.current)}</p>
                                <p className={`text-sm font-semibold ${deltaColor}`}>
                                    {sign}{formatCurrency(values.delta)} 
                                    <span className="text-xs text-gray-400"> (vs. {formatCurrency(values.prev)})</span>
                                </p>
                            </div>
                        )
                    })}
                 </div>
            </div>
        </div>
    );
};

export default IncrementalInsights;
