import React, { useState, ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

interface SplitViewLayoutProps {
    executiveAnalysis: ReactNode;
    chatPanel: ReactNode;
}

const SplitViewLayout: React.FC<SplitViewLayoutProps> = ({ executiveAnalysis, chatPanel }) => {
    const [isExecutiveAnalysisMinimized, setIsExecutiveAnalysisMinimized] = useState(false);

    const toggleExecutiveAnalysis = () => {
        setIsExecutiveAnalysisMinimized(prev => !prev);
    };

    const executiveAnalysisWidthClass = isExecutiveAnalysisMinimized ? 'w-full lg:w-1/4' : 'w-full lg:w-2/3';
    const chatPanelWidthClass = isExecutiveAnalysisMinimized ? 'w-full lg:w-3/4' : 'w-full lg:w-1/3';

    return (
        <div className="flex flex-col lg:flex-row h-full lg:h-[calc(100vh-64px)] relative">
            {/* Executive Analysis Panel */}
            <div
                className={`transition-all duration-300 ease-in-out 
                           ${executiveAnalysisWidthClass}
                           h-full
                           overflow-hidden flex flex-col border-r border-gray-700/50`}
            >
                <div className="flex-grow overflow-y-auto p-4">
                    {executiveAnalysis}
                </div>
            </div>

            {/* Chat Panel */}
            <div
                className={`transition-all duration-300 ease-in-out 
                           ${chatPanelWidthClass}
                           h-full
                           overflow-hidden flex flex-col`}
            >
                <div className="flex-grow overflow-y-auto p-4">
                    {chatPanel}
                </div>
            </div>

            {/* Toggle Button for Desktop */}
            <div className={`absolute top-1/2 transform -translate-y-1/2 
                        ${isExecutiveAnalysisMinimized ? 'left-[25%-16px]' : 'left-[66.66%-16px]'}
                        hidden lg:flex items-center justify-center z-40`}>
                <button
                    onClick={toggleExecutiveAnalysis}
                    className="bg-gray-700 hover:bg-gray-600 text-gray-300 p-1 rounded-full shadow-lg focus:outline-none"
                >
                    {isExecutiveAnalysisMinimized ? <ChevronRightIcon className="w-5 h-5" /> : <ChevronLeftIcon className="w-5 h-5" />}
                </button>
            </div>

            {/* Toggle Button for Mobile (bottom) */}
            <div className="lg:hidden fixed bottom-0 left-0 w-full p-2 bg-gray-800 border-t border-gray-700 z-40">
                <button
                    onClick={toggleExecutiveAnalysis}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                    {isExecutiveAnalysisMinimized ? 'Expandir Análise' : 'Minimizar Análise'}
                </button>
            </div>
        </div>
    );
};

export default SplitViewLayout;
