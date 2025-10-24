# Nexus QuantumI2A2: Backend de Análise Fiscal

Este diretório contém o backend para a aplicação Nexus QuantumI2A2. Ele é construído com FastAPI e Celery para fornecer um pipeline de processamento de dados assíncrono, robusto e escalável.

## Arquitetura

O backend utiliza uma arquitetura de microserviços orquestrada pelo Docker Compose:

-   **`backend` (FastAPI):** Um servidor de API que expõe endpoints para os clientes (frontend). Ele é responsável por receber os uploads, iniciar as tarefas de análise e fornecer atualizações de status.
-   **`worker` (Celery):** Um processo de background que executa as tarefas de análise pesadas (o pipeline de agentes). Isso permite que a API responda instantaneamente, enquanto o trabalho é feito de forma assíncrona.
-   **`rabbitmq` (Message Broker):** Uma fila de mensagens que desacopla a API dos workers. A API publica tarefas na fila, e os workers as consomem para processamento.
-   **`redis` (In-Memory Store):** Atua como o "backend de resultados" do Celery, armazenando o estado e os resultados das tarefas, permitindo que a API os consulte.

## Como Executar

Todo o ambiente é containerizado, facilitando a execução com um único comando.

### Pré-requisitos

1.  **Docker e Docker Compose:** Certifique-se de que ambos estão instalados em sua máquina.
2.  **Chave de API do Google Gemini:** Você precisa de uma chave de API para que os agentes de IA funcionem.

### Passos para Execução

1.  **Navegue para o Diretório Raiz:** Abra um terminal no diretório que contém o `docker-compose.yml`.

2.  **Crie um Arquivo de Ambiente:** Crie um arquivo chamado `.env` na raiz do projeto (no mesmo nível do `docker-compose.yml`) e adicione sua chave de API do Google:

    ```sh
    # .env
    GOOGLE_API_KEY=SUA_CHAVE_DE_API_AQUI
    ```
    O `docker-compose.yml` está configurado para ler este arquivo e passar a chave para os containers da API e do worker.

3.  **Inicie os Serviços:** Execute o seguinte comando para construir as imagens e iniciar todos os contêineres:

    ```bash
    docker-compose up --build
    ```

    -   A flag `--build` garante que a imagem do Docker seja reconstruída se você fizer alterações no código do backend.
    -   Você verá os logs de todos os serviços (API, worker, RabbitMQ, Redis) no seu terminal.

4.  **Acesse a Aplicação:**
    -   **API FastAPI:** Estará disponível em `http://localhost:8000`.
    -   **Documentação da API (Swagger UI):** Acesse `http://localhost:8000/docs` para ver e interagir com os endpoints.
    -   **RabbitMQ Management UI:** Acesse `http://localhost:15672` para monitorar as filas (login: `guest` / `guest`).

### Testando o Pipeline

1.  Vá para a documentação da API em `http://localhost:8000/docs`.
2.  Expanda o endpoint `POST /analysis`.
3.  Clique em "Try it out".
4.  Use o botão "Choose File" para selecionar um ou mais arquivos para análise.
5.  Clique em "Execute". Você deverá receber uma resposta `202 Accepted` com um `task_id`.
6.  Copie o `task_id`.
7.  Vá para o endpoint `GET /analysis/{task_id}/status`, clique em "Try it out", cole o `task_id` e execute para ver o progresso da análise.

## Parando o Ambiente

Para parar todos os contêineres, pressione `Ctrl+C` no terminal onde o `docker-compose up` está rodando, ou execute o seguinte comando em outro terminal:

```bash
docker-compose down
```
