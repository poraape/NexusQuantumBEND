import React from 'react';
// FIX: Imported the missing 'AgentState' type.
import type { AgentStates, AgentName, AgentState } from '../types';
import { CheckIcon, LoadingSpinnerIcon } from './icons';

interface Step {
    id: AgentName;
    label: string;
}

const ProgressTracker: React.FC<{ agentStates: AgentStates }> = ({ agentStates }) => {
    const steps: Step[] = [
        { id: 'ocr', label: 'OCR' },
        { id: 'auditor', label: 'Auditor' },
        { id: 'classifier', label: 'Classificador' },
        { id: 'crossValidator', label: 'Validador' },
        { id: 'intelligence', label: 'Inteligência' },
        { id: 'accountant', label: 'Contador' },
    ];

    const completedCount = steps.filter(step => agentStates[step.id].status === 'completed').length;
    let progressPercentage = (completedCount / steps.length) * 100;
    
    const runningAgentIndex = steps.findIndex(step => agentStates[step.id].status === 'running');
    let runningAgentDetails = null;

    if (runningAgentIndex !== -1) {
        const runningAgent = steps[runningAgentIndex];
        const { progress } = agentStates[runningAgent.id];
        runningAgentDetails = progress;
        
        const agentProgress = progress.total > 0 ? progress.current / progress.total : 0;
        progressPercentage = ((runningAgentIndex + agentProgress) / steps.length) * 100;
    }


    const getStatusStyles = (status: AgentState['status']) => {
        switch (status) {
            case 'completed': return { bg: 'bg-teal-500', text: 'text-teal-300' };
            case 'running': return { bg: 'bg-blue-500', text: 'text-blue-300' };
            case 'error': return { bg: 'bg-red-600', text: 'text-red-400' };
            default: return { bg: 'bg-gray-700', text: 'text-gray-500' };
        }
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg animate-fade-in">
            <h2 className="text-xl font-bold mb-2 text-gray-200">Progresso da Análise</h2>
             {runningAgentDetails && (
                 <div className="text-center text-sm text-gray-400 h-8 flex items-center justify-center mb-4">
                    <p>
                        <span className="font-semibold text-blue-300">{steps[runningAgentIndex].label}:</span> {runningAgentDetails.step}
                        {runningAgentDetails.total > 0 && ` (${runningAgentDetails.current} / ${runningAgentDetails.total})`}
                    </p>
                 </div>
            )}
            
            <div className="relative pt-8">
                {/* Main progress bar */}
                <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                        className="bg-gradient-to-r from-blue-600 to-teal-500 h-2 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${progressPercentage}%` }}
                    />
                </div>
                
                {/* Step indicators */}
                <div className="flex justify-between w-full absolute -top-1">
                    {steps.map((step, index) => {
                        const { status } = agentStates[step.id];
                        const styles = getStatusStyles(status);
                        const isCompleted = status === 'completed';
                        const isRunning = status === 'running';

                        return (
                            <div key={step.id} className="flex flex-col items-center" style={{ 
                                position: 'absolute',
                                left: `${(index / (steps.length - 1)) * 100}%`,
                                transform: 'translateX(-50%)'
                            }}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-4 border-gray-800 transition-colors ${styles.bg}`}>
                                    {isCompleted ? <CheckIcon className="w-5 h-5 text-white" /> 
                                    : isRunning ? <LoadingSpinnerIcon className="w-5 h-5 text-white animate-spin" /> 
                                    : status === 'error' ? <span className="font-bold text-lg text-white">!</span>
                                    : null
                                    }
                                </div>
                                <span className={`mt-2 text-xs font-semibold ${styles.text}`}>{step.label}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ProgressTracker;