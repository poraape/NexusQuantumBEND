import React, { useState, useEffect } from 'react';
import { logger, LogEntry } from '../services/logger';
import { exportLogsToFile } from '../utils/exportLogs';

const LogsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        const subscription = (newLogs: LogEntry[]) => {
            setLogs(newLogs);
        };
        logger.subscribe(subscription);
        return () => {
            logger.unsubscribe(subscription);
        };
    }, []);

    const filteredLogs = logs.filter(log => 
        filter ? log.agent.toLowerCase().includes(filter.toLowerCase()) : true
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-gray-800 text-white rounded-lg shadow-lg w-3/4 h-3/4 flex flex-col">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold">Logs</h2>
                    <div className="flex items-center">
                        <input
                            type="text"
                            placeholder="Filtrar por agente (ex: ImportPipeline)..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="bg-gray-700 text-white rounded px-2 py-1 mr-4"
                        />
                        <button
                            onClick={() => exportLogsToFile(logs)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded-lg text-sm mr-2"
                        >
                            Exportar Logs
                        </button>
                        <button onClick={onClose} className="text-white">Fechar</button>
                    </div>
                </div>
                <div className="p-4 overflow-y-auto flex-grow">
                    {filteredLogs.map((log, index) => (
                        <div key={index} className="font-mono text-sm mb-2">
                            <span className={`mr-2 ${log.level === 'ERROR' ? 'text-red-500' : log.level === 'WARN' ? 'text-yellow-500' : 'text-green-500'}`}>
                                [{log.timestamp}] [{log.level}]
                            </span>
                            <span className="font-bold mr-2">({log.agent})</span>
                            <span>{log.message}</span>
                            {log.metadata && (
                                <pre className="text-xs bg-gray-900 p-2 rounded mt-1 overflow-x-auto">
                                    {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default LogsPanel;