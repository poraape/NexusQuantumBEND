// services/logger.ts

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  agent: string; // Could be a component name or agent name
  level: LogLevel;
  message: string;
  metadata?: Record<string, any>;
}

class LoggerService {
  private logs: LogEntry[] = [];
  private subscribers: ((logs: LogEntry[]) => void)[] = [];
  private readonly MAX_LOGS = 500;

  log(agent: string, level: LogLevel, message: string, metadata?: Record<string, any>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      agent,
      level,
      message,
      metadata,
    };

    if (this.logs.length >= this.MAX_LOGS) {
        this.logs.shift(); // Remove the oldest log
    }
    this.logs.push(entry);

    console.log(`[${level}] (${agent}): ${message}`, metadata || '');

    this.notifySubscribers();
  }

  getLogs = (): LogEntry[] => {
    return this.logs;
  };

  subscribe = (callback: (logs: LogEntry[]) => void) => {
    this.subscribers.push(callback);
    callback(this.logs); // Immediately provide current logs
  };

  unsubscribe = (callback: (logs: LogEntry[]) => void) => {
    this.subscribers = this.subscribers.filter(cb => cb !== callback);
  };
  
  clear = () => {
    if (this.logs.length === 0) {
        return;
    }

    this.logs = [];
    // Evite gerar uma nova entrada de log ao limpar o cache para não poluir métricas.
    console.info('[Logger] Cache limpo.');
    this.notifySubscribers();
  }

  private notifySubscribers() {
    // Notify subscribers with a copy of the logs array
    this.subscribers.forEach(cb => cb([...this.logs]));
  }
}

// Export a singleton instance
export const logger = new LoggerService();
