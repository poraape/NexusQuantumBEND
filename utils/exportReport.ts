import type { AuditReport, ChatMessage, KeyMetric, AnalysisResult, DeterministicCrossValidationResult, AICrossValidationResult, AccountingEntry } from '../types';
import { logger } from '../services/logger';

interface ExportData {
    report: AuditReport;
    messages: ChatMessage[];
    // Add chart data if needed, for now, we'll derive from report
}

const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const generateHtmlHeader = (title: string) => `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4; }
            .container { max-width: 900px; margin: 20px auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1, h2, h3 { color: #0056b3; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-top: 20px; }
            h1 { text-align: center; color: #004085; }
            h2 { color: #0056b3; }
            h3 { color: #0069d9; }
            .section { margin-bottom: 20px; padding: 15px; background-color: #e9f7ff; border-left: 5px solid #007bff; border-radius: 5px; }
            .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-top: 15px; }
            .metric-item { background-color: #fff; padding: 15px; border-radius: 5px; border: 1px solid #cce5ff; }
            .metric-item strong { color: #004085; }
            .metric-item .status { font-weight: bold; padding: 2px 8px; border-radius: 3px; display: inline-block; margin-left: 10px; font-size: 0.8em; }
            .status-OK { background-color: #d4edda; color: #155724; }
            .status-ALERT { background-color: #fff3cd; color: #856404; }
            .status-UNAVAILABLE { background-color: #f8d7da; color: #721c24; }
            .chat-message { margin-bottom: 10px; padding: 8px 12px; border-radius: 5px; }
            .chat-user { background-color: #e6f7ff; text-align: right; }
            .chat-ai { background-color: #f0f0f0; text-align: left; }
            .chat-sender { font-weight: bold; margin-bottom: 5px; }
            .chat-text { white-space: pre-wrap; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; color: #333; }
            .insight-list li, .recommendation-list li { margin-bottom: 5px; }
            .error-message { color: #dc3545; font-weight: bold; }
            pre { background-color: #eee; padding: 10px; border-radius: 5px; overflow-x: auto; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>${title}</h1>
            <p style="text-align: center; color: #666;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
`;

const generateHtmlFooter = () => `
        </div>
    </body>
    </html>
`;

const generateMetricsHtml = (metrics: Record<string, KeyMetric>) => {
    let html = '<h2>Métricas Chave</h2><div class="metric-grid">';
    for (const key in metrics) {
        const metric = metrics[key];
        html += `
            <div class="metric-item">
                <strong>${metric.metric}:</strong> ${metric.value}
                <span class="status status-${metric.status}">${metric.status}</span>
                ${metric.explanation ? `<p style="font-size: 0.9em; color: #555;">${metric.explanation}</p>` : ''}
                ${metric.insight ? `<p style="font-size: 0.9em; color: #004085;"><em>Insight:</em> ${metric.insight}</p>` : ''}
            </div>
        `;
    }
    html += '</div>';
    return html;
};

const generateInsightsHtml = (insights: string[], title: string) => {
    if (!insights || insights.length === 0) return '';
    let html = `<h2>${title}</h2><div class="section"><ul>`;
    insights.forEach(insight => {
        html += `<li>${insight}</li>`;
    });
    html += '</ul></div>';
    return html;
};

const generateChatHtml = (messages: ChatMessage[]) => {
    if (!messages || messages.length === 0) return '';
    let html = '<h2>Transcrição do Chat</h2><div class="section" style="background-color: #f9f9f9;">';
    messages.forEach(msg => {
        const senderClass = msg.sender === 'user' ? 'chat-user' : 'chat-ai';
        html += `
            <div class="chat-message ${senderClass}">
                <div class="chat-sender">${msg.sender === 'user' ? 'Você' : 'Assistente IA'}</div>
                <div class="chat-text">${msg.text}</div>
            </div>
        `;
    });
    html += '</div>';
    return html;
};

const generateTableHtml = (data: Record<string, any>[], title: string) => {
    if (!data || data.length === 0) return '';
    let html = `<h2>${title}</h2><div class="section"><table><thead><tr>`;
    const headers = Object.keys(data[0]);
    headers.forEach(header => {
        html += `<th>${header}</th>`;
    });
    html += '</tr></thead><tbody>';
    data.forEach(row => {
        html += '<tr>';
        headers.forEach(header => {
            html += `<td>${row[header]}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
};

const generateCrossValidationHtml = (results: DeterministicCrossValidationResult | AICrossValidationResult, title: string) => {
    if (!results || Object.keys(results).length === 0) return '';
    let html = `<h2>${title}</h2><div class="section">`;
    if ('summary' in results) { // DeterministicCrossValidationResult
        html += `<p><strong>Sumário:</strong> ${results.summary}</p>`;
        if (results.discrepancies && results.discrepancies.length > 0) {
            html += '<h3>Discrepâncias Encontradas:</h3><ul>';
            results.discrepancies.forEach(disc => {
                html += `<li><strong>${disc.type}:</strong> ${disc.description} (Documentos: ${disc.documents.join(', ')})</li>`;
            });
            html += '</ul>';
        }
    } else if ('aiDrivenInsights' in results) { // AICrossValidationResult
        if (results.aiDrivenInsights && results.aiDrivenInsights.length > 0) {
            html += '<h3>Insights da IA:</h3><ul>';
            results.aiDrivenInsights.forEach(insight => {
                html += `<li><strong>${insight.category} (${insight.severity}):</strong> ${insight.description} (Evidência: ${insight.evidence.join(', ')})</li>`;
            });
            html += '</ul>';
        }
    }
    html += '</div>';
    return html;
};

const generateAccountingEntriesHtml = (entries: AccountingEntry[]) => {
    if (!entries || entries.length === 0) return '';
    let html = '<h2>Lançamentos Contábeis Sugeridos</h2><div class="section"><table><thead><tr><th>Documento</th><th>Conta</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>';
    entries.forEach(entry => {
        html += `<tr><td>${entry.docName}</td><td>${entry.account}</td><td>${entry.type}</td><td>${formatCurrency(entry.value)}</td></tr>`;
    });
    html += '</tbody></table></div>';
    return html;
};

export const exportReportToHtml = (data: ExportData) => {
    const { report, messages } = data;
    const title = report.summary?.title || 'Relatório de Análise Fiscal';
    let htmlContent = generateHtmlHeader(title);

    if (report.summary) {
        htmlContent += `
            <div class="section">
                <h2>Sumário Executivo</h2>
                <p>${report.summary.summary}</p>
            </div>
        `;
        htmlContent += generateMetricsHtml(report.aggregatedMetrics);
        htmlContent += generateInsightsHtml(report.summary.actionableInsights, 'Insights Acionáveis');
        htmlContent += generateInsightsHtml(report.summary.strategicRecommendations, 'Recomendações Estratégicas');
    }

    if (report.deterministicCrossValidation) {
        htmlContent += generateCrossValidationHtml(report.deterministicCrossValidation, 'Validação Cruzada Determinística');
    }

    if (report.crossValidationResults) {
        htmlContent += generateCrossValidationHtml(report.crossValidationResults, 'Validação Cruzada por IA');
    }

    if (report.accountingEntries && report.accountingEntries.length > 0) {
        htmlContent += generateAccountingEntriesHtml(report.accountingEntries);
    }

    if (report.spedFile) {
        htmlContent += `
            <h2>Arquivo SPED EFD (Exemplo)</h2>
            <div class="section">
                <h3>${report.spedFile.filename}</h3>
                <pre>${report.spedFile.content}</pre>
            </div>
        `;
    }

    htmlContent += generateChatHtml(messages);

    htmlContent += generateHtmlFooter();

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
