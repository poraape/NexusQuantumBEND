# Nexus QuantumI2A2: Análise Fiscal com IA (Frontend-Only)

**Nexus QuantumI2A2** é uma Single Page Application (SPA) de análise fiscal interativa que processa dados de Notas Fiscais Eletrônicas (NFe) e gera insights acionáveis através de um sistema de IA que simula múltiplos agentes especializados, **executando integralmente no navegador do cliente**.

Esta aplicação demonstra uma arquitetura moderna frontend-only, onde o processamento de dados e as chamadas para a IA são gerenciados diretamente pelo cliente, garantindo privacidade, menor latência e uma infraestrutura simplificada.

---

## ✨ Funcionalidades Principais

*   **Pipeline Multiagente no Cliente:** Uma cadeia de agentes especializados (Importação/OCR, Auditor, Classificador, Agente de Inteligência, Contador) processa os arquivos em etapas, de forma assíncrona, no navegador.
*   **Upload Flexível de Arquivos:** Suporte para múltiplos formatos, incluindo `XML`, `CSV`, `XLSX`, `PDF`, imagens (`PNG`, `JPG`) e arquivos `.ZIP` contendo múltiplos documentos.
*   **Análise Fiscal Aprofundada por IA:** Geração de um relatório detalhado com:
    *   **Resumo Executivo e Recomendações Estratégicas** gerados por IA.
    *   **Detecção de Anomalias por IA** que vai além de regras fixas.
    *   **Validação Cruzada (Cross-Validation)** entre documentos para encontrar discrepâncias sutis.
*   **Busca Inteligente (Smart Search):** Interaja com seus dados através de perguntas em linguagem natural diretamente no dashboard.
*   **Chat Interativo com IA:** Um assistente de IA, contextualizado com os dados do relatório, permite explorar os resultados e gera visualizações de dados sob demanda.
*   **Dashboards Dinâmicos:** Painéis interativos com KPIs, gráficos e filtros para uma visão aprofundada dos dados fiscais.
*   **Apuração Contábil e Geração de SPED/EFD:** Geração automática de lançamentos contábeis e de um arquivo de texto no layout simplificado do SPED Fiscal.
*   **Exportação de Relatórios:** Exporte a análise completa ou as conversas do chat para formatos como `PDF`, `DOCX`, `HTML` e `Markdown`.

---

## 🏗️ Arquitetura: Frontend-Only com Agentes Assíncronos

A aplicação opera de forma autônoma no navegador, orquestrando tarefas complexas sem a necessidade de um backend dedicado.

*   **Orquestração de Agentes (React Hooks):** O hook `useAgentOrchestrator` atua como o cérebro da aplicação, executando o pipeline de análise de forma sequencial e assíncrona. Isso garante que a interface do usuário permaneça responsiva mesmo durante o processamento de arquivos pesados.
*   **Processamento de Dados no Cliente:** Bibliotecas de alta performance são utilizadas para manipular arquivos diretamente no navegador:
    *   **Parsing:** `pdfjs-dist`, `xlsx`, `fast-xml-parser` e `jszip` para ler e extrair dados de diversos formatos.
    *   **OCR:** `tesseract.js` para extrair texto de PDFs baseados em imagem e outros formatos de imagem.
*   **Inteligência Artificial Direta:** As interações com a IA são feitas através do SDK oficial `@google/genai`, que se comunica diretamente dos clientes para a API do Google Gemini. A chave de API é gerenciada de forma segura como uma variável de ambiente.
*   **Gerenciamento de Estado:** O estado da aplicação, incluindo o progresso da análise, relatórios e conversas, é gerenciado inteiramente pelo React, garantindo uma renderização eficiente e reativa.

---

## 🚀 Execução do Projeto

### No AI Studio
1.  **Configure a Chave de API:** Certifique-se de que sua chave de API do Google Gemini está configurada corretamente nas variáveis de ambiente do projeto.
2.  **Execute o Frontend:** Clique no botão "Run" ou "Executar".
3.  Uma nova aba será aberta com a aplicação em funcionamento. Como não há backend, ela está pronta para uso imediato.

### Localmente
1.  **Clone o repositório.**
2.  **Configure as Variáveis de Ambiente:** Crie um arquivo `.env` na raiz e adicione sua chave de API:
    ```sh
    # .env
    # Se estiver usando Vite
    VITE_GOOGLE_API_KEY=SUA_CHAVE_DE_API_AQUI
    ```
3.  **Inicie um Servidor de Desenvolvimento:**
   ```bash
   # Instale as dependências
   npm install
   # Inicie o servidor
   npm run dev
   ```
4.  Acesse a URL fornecida (geralmente `http://localhost:5173`).

---

## 📁 Estrutura de Pastas

```
/
├── src/
│   ├── agents/            # Lógica de negócios de cada agente IA
│   ├── components/        # Componentes React reutilizáveis
│   ├── hooks/             # Hooks React customizados (ex: useAgentOrchestrator)
│   ├── services/          # Serviços (chamadas à API Gemini, logger)
│   ├── utils/             # Funções utilitárias (parsers, exportação, regras)
│   ├── App.tsx            # Componente principal da aplicação
│   └── types.ts           # Definições de tipos TypeScript
├── index.html             # Arquivo HTML principal
└── README.md              # Este arquivo
```