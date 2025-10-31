import React, { useState, useCallback } from 'react';
import FileUpload from './components/FileUpload';
import ProgressTracker from './components/ProgressTracker';
import ReportViewer from './components/ReportViewer';
import ChatPanel from './components/ChatPanel';
import Header from './components/Header';
import Toast from './components/Toast';
import PipelineErrorDisplay from './components/PipelineErrorDisplay';
import { useAgentOrchestrator } from './hooks/useAgentOrchestrator';
import { logger } from './services/logger';
import LogsPanel from './components/LogsPanel';
import SplitViewLayout from './components/SplitViewLayout';

const App: React.FC = () => {
  const [showLogs, setShowLogs] = useState(false);

  const {
    agentStates,
    auditReport,
    messages,
    isStreaming,
    error,
    isPipelineRunning,
    isPipelineComplete,
    pipelineError,
    runPipeline,
    handleSendMessage,
    handleStopStreaming,
    setError,
    handleClassificationChange,
    handleCostCenterChange,
    runReconciliationPipeline,
    reset: resetOrchestrator,
  } = useAgentOrchestrator();

  const handleStartAnalysis = useCallback(async (files: File[]) => {
    await runPipeline(files);
  }, [runPipeline]);

  const resetApp = useCallback(() => {
    resetOrchestrator();
    logger.clear();
    logger.log('App', 'INFO', 'Aplicativo resetado para uma nova análise.');
  }, [resetOrchestrator]);

  const onAddFilesForChat = useCallback((newFiles: File[]) => {
      if (isPipelineRunning) {
          const warning = 'Aguarde a conclusão da análise atual antes de adicionar novos arquivos.';
          logger.log('App', 'WARN', warning);
          setError(warning);
          return;
      }

      if (!newFiles.length) {
          return;
      }

      logger.log('App', 'INFO', `Arquivos adicionais recebidos via chat: ${newFiles.map(f => f.name).join(', ')}`);
      setError('Iniciando nova análise com os arquivos adicionados...');
      runPipeline(newFiles);
  }, [runPipeline, isPipelineRunning, setError]);
  
  return (
    <div className="bg-gray-900 text-gray-200 min-h-screen font-sans flex flex-col">
      <Header 
        onShowLogs={() => setShowLogs(true)} 
        onReset={resetApp} 
        isAnalysisComplete={isPipelineComplete && !isPipelineRunning}
        auditReport={auditReport}
        messages={messages}
      />
      
      <main className="flex-grow p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {!isPipelineComplete && !pipelineError && (
          <div className="max-w-4xl mx-auto">
            {isPipelineRunning ? (
              <ProgressTracker agentStates={agentStates} />
            ) : (
              <FileUpload onStartAnalysis={handleStartAnalysis} disabled={isPipelineRunning} />
            )}
          </div>
        )}

        {pipelineError && (
          <PipelineErrorDisplay onReset={resetApp} errorMessage={error} />
        )}

        {isPipelineComplete && auditReport && (
          <SplitViewLayout
            executiveAnalysis={
              <div className="space-y-8">
                <ReportViewer
                    report={auditReport}
                    onClassificationChange={handleClassificationChange}
                    onCostCenterChange={handleCostCenterChange}
                    onStartReconciliation={runReconciliationPipeline}
                    isReconciliationRunning={agentStates.reconciliation.status === 'running'}
                />
              </div>
            }
            chatPanel={
              <div className="pt-8 border-t border-gray-700/50">
                <h2 className="text-2xl font-bold text-gray-200 mb-4 text-center">Explore os Dados</h2>
                <ChatPanel
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    isStreaming={isStreaming}
                    onStopStreaming={handleStopStreaming}
                    report={auditReport}
                    setError={setError}
                    onAddFiles={onAddFilesForChat}
                    isPipelineRunning={isPipelineRunning}
                />
              </div>
            }
          />
        )}
      </main>

      {error && <Toast message={error} onClose={() => setError(null)} />}
      {showLogs && <LogsPanel onClose={() => setShowLogs(false)} />}
    </div>
  );
};

export default App;
