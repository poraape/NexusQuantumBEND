import { LogEntry, logger } from '../services/logger';

export const exportLogsToFile = (logs: LogEntry[]) => {
    const formattedLogs = logs.map(log => {
        const metadata = log.metadata ? JSON.stringify(log.metadata) : '';
        return `${log.timestamp} [${log.level}] (${log.agent}): ${log.message} ${metadata}`.trim();
    }).join('\n');

    const blob = new Blob([formattedLogs], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nexus_quantum_logs_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

