# Nexus QuantumI2A2: Análise Fiscal com IA (Aplicação Híbrida)

**Nexus QuantumI2A2** é uma aplicação híbrida (Frontend e Backend) de análise fiscal interativa que processa dados de Notas Fiscais Eletrônicas (NFe) e gera insights acionáveis através de um sistema de IA que simula múltiplos agentes especializados. A aplicação combina uma interface de usuário rica no navegador com um robusto backend para processamento de dados e orquestração de tarefas complexas.

Esta aplicação demonstra uma arquitetura moderna que aproveita o poder do processamento no cliente para interatividade e um backend dedicado para escalabilidade, segurança e execução de tarefas intensivas.

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

## 🏗️ Arquitetura: Híbrida (Frontend e Backend)

A aplicação opera com uma arquitetura híbrida, combinando um frontend interativo no navegador com um backend robusto para processamento de dados e orquestração de tarefas. Isso permite aproveitar o melhor de ambos os mundos: a responsividade e a experiência do usuário do processamento no cliente, e a escalabilidade e a capacidade de processamento intensivo do lado do servidor.

*   **Backend (Python com FastAPI e Celery):** O backend é construído com Python, utilizando o framework FastAPI para expor APIs RESTful. Ele é responsável por:
    *   Processamento de dados complexos e de grande volume.
    *   Integração com modelos de IA que requerem mais recursos computacionais ou acesso a dados sensíveis.
    *   Gerenciamento de tarefas assíncronas e de longa duração através do Celery, garantindo que o frontend permaneça responsivo.
    *   Persistência de dados e interação com bancos de dados (se aplicável).
    *   Autenticação e autorização de usuários.

*   **Orquestração de Agentes (React Hooks):**** O hook `useAgentOrchestrator` atua como o cérebro da aplicação, executando o pipeline de análise de forma sequencial e assíncrona. Isso garante que a interface do usuário permaneça responsiva mesmo durante o processamento de arquivos pesados.
*   **Processamento de Dados no Cliente:** Bibliotecas de alta performance são utilizadas para manipular arquivos diretamente no navegador:
    *   **Parsing:** `pdfjs-dist`, `xlsx`, `fast-xml-parser` e `jszip` para ler e extrair dados de diversos formatos.
    *   **OCR:** `tesseract.js` para extrair texto de PDFs baseados em imagem e outros formatos de imagem.
*   **Inteligência Artificial:** As interações com a IA podem ser realizadas de duas formas:
    *   **Diretamente do Cliente:** Para interações mais leves e em tempo real, o frontend pode se comunicar diretamente com a API do Google Gemini usando o SDK `@google/genai`.
    *   **Via Backend:** Para tarefas de IA mais complexas, que exigem maior poder computacional, acesso a dados sensíveis ou orquestração com outros serviços, as requisições são encaminhadas ao backend, que as processa e gerencia a comunicação com os modelos de IA.
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
    VITE_GEMINI_API_KEY=SUA_CHAVE_DE_API_AQUI
    # Opcional: personalize o host dos dados de idioma do Tesseract
    # VITE_TESSERACT_LANG_PATH=https://tessdata.projectnaptha.com/4.0.0
    ```
3.  **Backend (Python/FastAPI/Celery):**
    *   Navegue até o diretório `backend`:
        ```bash
        cd backend
        ```
    *   Crie e ative um ambiente virtual (recomendado):
        ```bash
        python -m venv venv
        .\venv\Scripts\activate  # No Windows
        # source venv/bin/activate  # No Linux/macOS
        ```
    *   Instale as dependências:
        ```bash
        pip install -r requirements.txt
        ```
    *   Inicie o servidor FastAPI:
        ```bash
        uvicorn main:app --reload
        ```
    *   Em um terminal separado, inicie o Celery worker (se houver tarefas assíncronas):
        ```bash
        celery -A tasks worker --loglevel=info
        ```
4.  **Frontend (React/Vite):**
    *   Retorne ao diretório raiz do projeto:
        ```bash
        cd ..
        ```
    *   Instale as dependências:
        ```bash
        npm install
        ```
    *   Inicie o servidor de desenvolvimento:
        ```bash
        npm run dev
        ```
5.  Acesse a URL fornecida (geralmente `http://localhost:5173` para o frontend e `http://localhost:8000` para o backend).

---

## 📁 Estrutura de Pastas

```
/
├── .env                   # Variáveis de ambiente (local)
├── .env.example           # Exemplo de variáveis de ambiente
├── .gitignore             # Arquivos e diretórios ignorados pelo Git
├── App.tsx                # Componente principal da aplicação React
├── docker-compose.yml     # Configuração para Docker Compose
├── index.html             # Arquivo HTML principal do frontend
├── index.tsx              # Ponto de entrada do frontend React
├── package.json           # Dependências e scripts do frontend
├── postcss.config.cjs     # Configuração do PostCSS
├── README.md              # Este arquivo
├── tailwind.config.js     # Configuração do Tailwind CSS
├── tsconfig.json          # Configuração do TypeScript
├── vite.config.ts         # Configuração do Vite
├── agents/                # Lógica de negócios de cada agente IA (frontend)
├── backend/               # Código do backend Python
│   ├── app/               # Aplicação FastAPI
│   ├── celery_config.py   # Configuração do Celery
│   ├── Dockerfile         # Dockerfile para o backend
│   ├── main.py            # Ponto de entrada do FastAPI
│   ├── models.py          # Definições de modelos de dados
│   ├── requirements.txt   # Dependências do Python
│   └── tasks.py           # Tarefas do Celery
├── components/            # Componentes React reutilizáveis
├── hooks/                 # Hooks React customizados
├── services/              # Serviços de comunicação (frontend)
└── utils/                 # Funções utilitárias (frontend)
```