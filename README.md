# Nexus QuantumI2A2: Análise Fiscal com IA

**Nexus QuantumI2A2** é uma Single Page Application (SPA) de análise fiscal interativa que processa dados de Notas Fiscais Eletrônicas (NFe) e gera insights acionáveis através de um sistema de IA que simula múltiplos agentes especializados.

Esta aplicação demonstra uma arquitetura cliente-servidor robusta, onde o processamento pesado de dados é delegado a um backend assíncrono, enquanto o frontend foca em prover uma experiência de usuário rica e interativa.

---

## ✨ Funcionalidades Principais

*   **Pipeline Multiagente no Backend:** Uma cadeia de agentes especializados (Importação/OCR, Auditor, Classificador, Agente de Inteligência, Contador) processa os arquivos em etapas de forma assíncrona.
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

## 🏗️ Arquitetura: Cliente-Servidor com Processamento Assíncrono

A aplicação utiliza uma arquitetura cliente-servidor moderna para garantir escalabilidade, segurança e uma experiência de usuário responsiva. O processamento pesado de dados e as interações com a IA são delegados a um backend assíncrono, enquanto o frontend foca em fornecer uma interface rica e interativa.

### Frontend (Esta Aplicação)

A aplicação é uma SPA desenvolvida com **React** e **TypeScript**, utilizando **TailwindCSS** para estilização. Ela é responsável por:
*   Fornecer uma interface de usuário rica e interativa para upload de arquivos e visualização de relatórios.
*   Comunicar-se com o backend via API REST para iniciar análises e obter resultados.
*   Gerenciar o estado da aplicação, incluindo o progresso das tarefas em background através de polling.
*   Renderizar dashboards, relatórios e o assistente de chat com os dados processados pelo backend.

### Backend (Serviço Separado)

O backend é construído com **Python/FastAPI** e utiliza **Celery** com **RabbitMQ** e **Redis** para executar um pipeline de análise assíncrono e robusto. Suas responsabilidades incluem:
*   **API (FastAPI):** Expor endpoints REST para o frontend, gerenciar o ciclo de vida das tarefas e servir os resultados. A API implementa um **middleware CORS** para permitir a comunicação segura com o frontend.
*   **Workers Assíncronos (Celery):** Executar o pipeline de agentes (OCR, Auditoria, Classificação, etc.) em background, permitindo que a API responda imediatamente.
*   **Interação com a IA:** Todas as chamadas para a Google Gemini API são centralizadas no backend, protegendo as chaves de API e permitindo um gerenciamento de custos mais eficaz.
*   **Orquestração de Agentes:** Gerenciar o fluxo de trabalho complexo entre os diferentes agentes de análise, garantindo que os dados sejam processados de forma sequencial e resiliente.

---

## ✅ Qualidade e Automação (Metas de Produção)

O projeto adere a um rigoroso padrão de qualidade, imposto por automação no pipeline de CI/CD:

*   **Spec-as-Tests:** Testes de aceitação são derivados diretamente das especificações funcionais. Um conjunto de requisitos críticos **deve passar 100%** para que o deploy seja autorizado.
*   **CI/CD Gates:** O pipeline de integração contínua possui gates de qualidade automáticos, incluindo:
    *   **Cobertura de Testes:** Mínimo de 85%.
    *   **Testes de Performance:** Verificação de latência (P95 < 1200ms) e taxa de erro (< 2%) com k6.
    *   **Análise de Segurança:** Verificação de vulnerabilidades estáticas e de dependências.
*   **AutoFix:** Capacidade de utilizar IA para diagnosticar e propor correções para testes que falham, acelerando o ciclo de desenvolvimento.

---

## 🚀 Execução do Projeto

### No AI Studio
1.  **Execute o Backend:** Siga as instruções no arquivo `backend/README.md` para iniciar os serviços do backend com Docker Compose.
2.  **Execute o Frontend:** Clique no botão "Run" ou "Executar" no AI Studio para o projeto do frontend.
3.  Uma nova aba será aberta com a aplicação em funcionamento, pronta para se comunicar com o backend em `http://localhost:8000`.

### Localmente
1.  **Clone o repositório.**
2.  **Execute o Backend:** Siga as instruções no `backend/README.md` para iniciar o ambiente Docker.
3.  **Inicie o Servidor de Desenvolvimento do Frontend (ex: com Vite):**
   ```bash
   # Navegue até a pasta do frontend
   # Instale as dependências (se houver um package.json)
   npm install
   # Inicie o servidor
   npm run dev
   ```
4.  Acesse a URL do frontend fornecida (geralmente `http://localhost:5173`).

---

## 📁 Estrutura de Pastas (Frontend)

```
/
├── src/
│   ├── agents/            # Lógica de negócios de cada agente IA (legado, agora no backend)
│   ├── components/        # Componentes React reutilizáveis
│   ├── hooks/             # Hooks React customizados (ex: useAgentOrchestrator)
│   ├── services/          # Serviços (chamadas à API do backend, logger)
│   ├── utils/             # Funções utilitárias (parsers, exportação, regras)
│   ├── App.tsx            # Componente principal da aplicação
│   └── types.ts           # Definições de tipos TypeScript
├── backend/               # Código-fonte e configuração do backend FastAPI/Celery
├── index.html             # Arquivo HTML principal
└── README.md              # Este arquivo
```