import React from 'react';
import type { AgentStates, AgentName, AgentState } from '../types';
import { CheckIcon, LoadingSpinnerIcon } from './icons';

const processStages: { id: string; label: string; agents: AgentName[] }[] = [
    { id: 'import', label: 'Processando Arquivos', agents: ['ocr'] },
    { id: 'audit', label: 'Executando Auditoria', agents: ['auditor', 'classifier', 'crossValidator'] },
    { id: 'ai', label: 'Gerando Insights', agents: ['intelligence', 'accountant'] }
];

const ProgressTracker: React.FC<{ agentStates: AgentStates }> = ({ agentStates }) => {
    
    const getStageStatus = (stageAgents: AgentName[]): AgentState['status'] => {
        const statuses = stageAgents.map(agentId => agentStates[agentId].status);
        if (statuses.some(s => s === 'running')) return 'running';
        if (statuses.every(s => s === 'completed')) return 'completed';
        if (statuses.some(s => s === 'error')) return 'error';
        return 'pending';
    };

    const stageStatuses = processStages.map(stage => getStageStatus(stage.agents));
    const runningStageIndex = stageStatuses.findIndex(s => s === 'running');
    const firstPendingIndex = stageStatuses.findIndex(s => s === 'pending');

    let progressPercentage = 0;
    if (runningStageIndex !== -1) {
        progressPercentage = (runningStageIndex / processStages.length) * 100;
    } else if (firstPendingIndex !== -1 && firstPendingIndex > 0) {
        progressPercentage = ((firstPendingIndex) / processStages.length) * 100;
    } else if (firstPendingIndex === -1 && stageStatuses.every(s => s === 'completed')) {
        progressPercentage = 100;
    }
    
    const runningAgent = runningStageIndex !== -1 ? processStages[runningStageIndex].agents.map(id => agentStates[id]).find(s => s.status === 'running') : null;
    const runningStageLabel = runningStageIndex !== -1 ? processStages[runningStageIndex].label : '';
    const runningAgentDetails = runningAgent?.progress;
    
    const getStatusStyles = (status: AgentState['status']) => {
        switch (status) {
            case 'completed': return 'bg-teal-500 text-white';
            case 'running': return 'bg-blue-600 text-white';
            case 'error': return 'bg-red-600 text-white';
            default: return 'bg-gray-700 text-gray-400';
        }
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg animate-fade-in">
            <h2 className="text-xl font-bold mb-2 text-gray-200 text-center">Progresso da Análise</h2>
            <div className="text-center text-sm text-gray-400 h-8 flex items-center justify-center mb-6">
                 <p>
                    {runningAgentDetails ? (
                        <>
                            <span className="font-semibold text-blue-300">{runningStageLabel}:</span> {runningAgentDetails.step}
                            {runningAgentDetails.total > 0 && ` (${runningAgentDetails.current} / ${runningAgentDetails.total})`}
                        </>
                    ) : progressPercentage === 100 ? (
                        <span className="font-semibold text-teal-300">Análise concluída com sucesso!</span>
                    ) : (
                        "Iniciando pipeline de análise..."
                    )}
                </p>
            </div>
            
             <div className="relative pt-1">
                <div className="flex mb-2 items-center justify-between">
                    {processStages.map((stage, index) => (
                        <div key={stage.id} className="text-center w-1/3">
                            <div className={`text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full ${stageStatuses[index] === 'running' || stageStatuses[index] === 'completed' ? 'text-teal-600 bg-teal-200' : 'text-gray-600 bg-gray-200'}`}>
                                {stage.label}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-900/50">
                    <div style={{ width: `${progressPercentage}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-blue-600 to-teal-500 transition-all duration-700 ease-in-out"></div>
                </div>
            </div>
        </div>
    );
};

export default ProgressTracker;
