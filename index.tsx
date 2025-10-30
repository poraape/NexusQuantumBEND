import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { logger } from './services/logger';

declare global {
  interface Window {
    __nexusGlobalHandlersRegistered?: boolean;
  }
}

if (typeof window !== 'undefined' && !window.__nexusGlobalHandlersRegistered) {
  window.addEventListener('error', (event) => {
    const errorStack = event.error instanceof Error ? event.error.stack : 'No stack available';
    logger.log('GlobalError', 'ERROR', 'Erro não tratado capturado pelo window.onerror.', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: errorStack,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reasonStack = event.reason instanceof Error ? event.reason.stack : 'No stack available';
    logger.log('GlobalError', 'ERROR', 'Promise rejeitada sem tratamento.', {
      reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
      stack: reasonStack,
    });
  });

  window.__nexusGlobalHandlersRegistered = true;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);