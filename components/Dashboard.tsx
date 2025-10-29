
import React from 'react';
import type { AuditReport } from '../types';
import DataPreview from './DataPreview'; // Import the new component
import { KeyMetric } from '../types';

interface DashboardProps {
    report: AuditReport;
}

const KeyMetricsDisplay: React.FC<{ metrics: KeyMetric[] }> = ({ metrics }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {metrics.map((metric, index) => (
            <div key={index} className="bg-gray-700/50 p-4 rounded-lg">
                <h3 className="text-sm text-gray-400 truncate" title={metric.metric}>{metric.metric}</h3>
                <p className="text-2xl font-bold text-teal-300 truncate" title={metric.value}>{metric.value || "--"}</p>
                <p className="text-xs text-gray-500 truncate" title={metric.insight}>{metric.insight}</p>
            </div>
        ))}
    </div>
);


const Dashboard: React.FC<DashboardProps> = ({ report }) => {

    // If there is no report, don't render anything
    if (!report) {
        return null;
    }

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg animate-fade-in space-y-8">
            
            {/* Display Key Metrics */}
            <div>
                <h2 className="text-xl font-bold text-gray-200 mb-4">Resumo da Análise</h2>
                <KeyMetricsDisplay metrics={report.summary.keyMetrics} />
            </div>

            {/* Display Raw Data */}
            <div>
                <h2 className="text-xl font-bold text-gray-200 mb-4 border-t border-gray-700 pt-8">Pré-visualização dos Dados</h2>
                <p className="text-xs text-gray-500 mb-4">
                    A tabela abaixo mostra uma pré-visualização dos dados extraídos do arquivo. Valores nulos, zerados ou com caracteres ilegíveis são destacados.
                </p>
                <DataPreview data={report.rawData} title="Conteúdo do Arquivo" />
            </div>

            {/* Existing components can be added here later */}
            {/* For example:
            <div>
                <h2 className="text-xl font-bold text-gray-200 mb-4 border-t border-gray-700 pt-8">Busca Inteligente com IA</h2>
                 <SmartSearch report={report} />
            </div>
            */}
        </div>
    );
};

export default Dashboard;
