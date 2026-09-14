// Additive chunk 3/6: 50 approved curated GitHub seeds for the live
// Phase 2 Awesome AI OSS card directory. Idempotent on repo_url.
// `added_on` is each repo's live GitHub created_at date (UTC, 2026-09-14).
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    INSERT INTO "app"."awesome_ai_oss_project" (
      "id", "name", "repo_url", "repo_host", "category",
      "blurb_en", "blurb_nl", "status", "source", "added_on", "created_at"
    ) VALUES
      ('curated-sqlite-vec', 'sqlite-vec', 'https://github.com/asg017/sqlite-vec', 'github', 'rag', 'Vector search extension for SQLite', 'Vectorzoek-extensie voor SQLite', 'approved', 'curated', '2024-04-20', '2024-04-20T12:00:00Z'),
      ('curated-unstructured', 'Unstructured', 'https://github.com/Unstructured-IO/unstructured', 'github', 'rag', 'ETL that turns unstructured documents into LLM-ready data', 'ETL die ongestructureerde documenten omzet naar LLM-klare data', 'approved', 'curated', '2022-09-26', '2022-09-26T12:00:00Z'),
      ('curated-docling', 'Docling', 'https://github.com/docling-project/docling', 'github', 'rag', 'Document conversion toolkit for PDFs and office files', 'Documentconversie-toolkit voor PDF’s en Office-bestanden', 'approved', 'curated', '2024-07-09', '2024-07-09T12:00:00Z'),
      ('curated-markitdown', 'MarkItDown', 'https://github.com/microsoft/markitdown', 'github', 'rag', 'Converts files and office documents to Markdown for LLM pipelines', 'Zet bestanden en Office-documenten om naar Markdown voor LLM-pipelines', 'approved', 'curated', '2024-11-13', '2024-11-13T12:00:00Z'),
      ('curated-mineru', 'MinerU', 'https://github.com/opendatalab/MinerU', 'github', 'rag', 'Parses complex PDFs/Office docs into LLM-ready Markdown/JSON', 'Zet complexe PDF’s/Office-docs om naar LLM-klare Markdown/JSON', 'approved', 'curated', '2024-02-29', '2024-02-29T12:00:00Z'),
      ('curated-sentence-transformers', 'sentence-transformers', 'https://github.com/huggingface/sentence-transformers', 'github', 'rag', 'Embeddings, retrieval, and reranking for semantic search and RAG', 'Embeddings, retrieval en reranking voor semantisch zoeken en RAG', 'approved', 'curated', '2019-07-24', '2019-07-24T12:00:00Z'),
      ('curated-llamaindex', 'LlamaIndex', 'https://github.com/run-llama/llama_index', 'github', 'rag', 'Data framework for connecting LLMs to private data and building RAG', 'Dataframework om LLM’s aan privédata te koppelen en RAG te bouwen', 'approved', 'curated', '2022-11-02', '2022-11-02T12:00:00Z'),
      ('curated-anythingllm', 'AnythingLLM', 'https://github.com/Mintplex-Labs/anything-llm', 'github', 'agent-uis', 'Self-hosted AI workspace with RAG, agents, and chat', 'Zelf-gehoste AI-werkplek met RAG, agents en chat', 'approved', 'curated', '2023-06-04', '2023-06-04T12:00:00Z'),
      ('curated-khoj', 'Khoj', 'https://github.com/khoj-ai/khoj', 'github', 'agent-uis', 'Self-hostable second brain: answers from the web or your docs', 'Zelf-hostbaar tweede brein: antwoorden van het web of je documenten', 'approved', 'curated', '2021-08-16', '2021-08-16T12:00:00Z'),
      ('curated-librechat', 'LibreChat', 'https://github.com/danny-avila/LibreChat', 'github', 'agent-uis', 'Self-hosted multi-provider AI chat UI with agents, RAG, and tools', 'Zelf-gehoste multi-provider AI-chat-UI met agents, RAG en tools', 'approved', 'curated', '2023-02-12', '2023-02-12T12:00:00Z'),
      ('curated-dify', 'Dify', 'https://github.com/langgenius/dify', 'github', 'agent-uis', 'Open-source LLM app platform with visual agent/RAG workflows', 'Open-source LLM-appplatform met visuele agent/RAG-workflows', 'approved', 'curated', '2023-04-12', '2023-04-12T12:00:00Z'),
      ('curated-open-webui', 'Open WebUI', 'https://github.com/open-webui/open-webui', 'github', 'agent-uis', 'Self-hosted ChatGPT-style UI for Ollama and OpenAI-compatible APIs', 'Zelf-gehoste ChatGPT-achtige UI voor Ollama en OpenAI-compatibele API’s', 'approved', 'curated', '2023-10-06', '2023-10-06T12:00:00Z'),
      ('curated-continue', 'Continue', 'https://github.com/continuedev/continue', 'github', 'agent-uis', 'Open-source AI coding assistant for VS Code and JetBrains', 'Open-source AI-codeerassistent voor VS Code en JetBrains', 'approved', 'curated', '2023-05-24', '2023-05-24T12:00:00Z'),
      ('curated-gpt-researcher', 'GPT Researcher', 'https://github.com/assafelovic/gpt-researcher', 'github', 'agent-tools', 'Autonomous agent that researches a topic and writes a sourced report', 'Autonome agent die een onderwerp onderzoekt en een bronnenrapport schrijft', 'approved', 'curated', '2023-05-12', '2023-05-12T12:00:00Z'),
      ('curated-firecrawl', 'Firecrawl', 'https://github.com/firecrawl/firecrawl', 'github', 'agent-tools', 'Crawler/API that turns websites into LLM-ready markdown', 'Crawler/API die websites omzet naar LLM-klare markdown', 'approved', 'curated', '2024-04-15', '2024-04-15T12:00:00Z'),
      ('curated-browser-use', 'browser-use', 'https://github.com/browser-use/browser-use', 'github', 'agent-tools', 'Library that lets AI agents operate a real browser', 'Library waarmee AI-agents een echte browser bedienen', 'approved', 'curated', '2024-10-31', '2024-10-31T12:00:00Z'),
      ('curated-searxng', 'SearXNG', 'https://github.com/searxng/searxng', 'github', 'agent-tools', 'Self-hosted metasearch for private agentic search', 'Zelf-gehoste metasearch voor privé agentic zoeken', 'approved', 'curated', '2021-04-12', '2021-04-12T12:00:00Z'),
      ('curated-jina-reader', 'jina-reader', 'https://github.com/jina-ai/reader', 'github', 'agent-tools', 'Converts any URL into LLM-friendly text', 'Zet elke URL om naar LLM-vriendelijke tekst', 'approved', 'curated', '2024-04-10', '2024-04-10T12:00:00Z'),
      ('curated-open-deep-research', 'open_deep_research', 'https://github.com/langchain-ai/open_deep_research', 'github', 'agent-tools', 'Open implementation of iterative deep-research agents', 'Open implementatie van iteratieve deep-research-agents', 'approved', 'curated', '2024-11-20', '2024-11-20T12:00:00Z'),
      ('curated-storm', 'STORM', 'https://github.com/stanford-oval/storm', 'github', 'agent-tools', 'LLM knowledge-curation system that researches and writes articles', 'LLM-kenniscuratiesysteem dat onderzoek doet en artikelen schrijft', 'approved', 'curated', '2024-03-24', '2024-03-24T12:00:00Z'),
      ('curated-crawl4ai', 'Crawl4AI', 'https://github.com/unclecode/crawl4ai', 'github', 'agent-tools', 'LLM-friendly web crawler and scraper designed for AI agents and RAG', 'LLM-vriendelijke webcrawler en scraper voor AI-agents en RAG', 'approved', 'curated', '2024-05-09', '2024-05-09T12:00:00Z'),
      ('curated-langfuse', 'Langfuse', 'https://github.com/langfuse/langfuse', 'github', 'eval-observability', 'Open-source tracing, prompt management, and evals', 'Open-source tracing, promptbeheer en evals', 'approved', 'curated', '2023-05-18', '2023-05-18T12:00:00Z'),
      ('curated-promptfoo', 'Promptfoo', 'https://github.com/promptfoo/promptfoo', 'github', 'eval-observability', 'Eval and red-teaming toolkit for prompts, agents, and RAG', 'Eval- en red-teaming-toolkit voor prompts, agents en RAG', 'approved', 'curated', '2023-04-28', '2023-04-28T12:00:00Z'),
      ('curated-ragas', 'Ragas', 'https://github.com/vibrantlabsai/ragas', 'github', 'eval-observability', 'Evaluation framework for RAG pipelines', 'Evaluatieframework voor RAG-pipelines', 'approved', 'curated', '2023-05-08', '2023-05-08T12:00:00Z'),
      ('curated-deepeval', 'DeepEval', 'https://github.com/confident-ai/deepeval', 'github', 'eval-observability', 'LLM evaluation framework with RAG and agent metrics', 'LLM-evaluatieframework met RAG- en agentmetrics', 'approved', 'curated', '2023-08-10', '2023-08-10T12:00:00Z'),
      ('curated-giskard', 'Giskard', 'https://github.com/Giskard-AI/giskard-oss', 'github', 'eval-observability', 'Open-source evaluation and testing library for LLM agents', 'Open-source evaluatie- en testbibliotheek voor LLM-agents', 'approved', 'curated', '2022-03-06', '2022-03-06T12:00:00Z'),
      ('curated-trulens', 'TruLens', 'https://github.com/truera/trulens', 'github', 'eval-observability', 'Evaluation and tracking for LLM apps including RAG-triad metrics', 'Evaluatie en tracking voor LLM-apps, inclusief RAG-triad-metrics', 'approved', 'curated', '2020-11-02', '2020-11-02T12:00:00Z'),
      ('curated-phoenix', 'Phoenix', 'https://github.com/Arize-ai/phoenix', 'github', 'eval-observability', 'Arize open-source AI observability and evaluation', 'Arize open-source AI-observability en -evaluatie', 'approved', 'curated', '2022-11-09', '2022-11-09T12:00:00Z'),
      ('curated-helicone', 'Helicone', 'https://github.com/Helicone/helicone', 'github', 'eval-observability', 'Open-source LLM observability, gateway, and prompt management', 'Open-source LLM-observability, gateway en promptbeheer', 'approved', 'curated', '2023-01-31', '2023-01-31T12:00:00Z'),
      ('curated-litellm', 'LiteLLM', 'https://github.com/BerriAI/litellm', 'github', 'eval-observability', 'Unified SDK/proxy to call 100+ LLM APIs in OpenAI format', 'Geünificeerde SDK/proxy om 100+ LLM-API’s in OpenAI-formaat aan te roepen', 'approved', 'curated', '2023-07-27', '2023-07-27T12:00:00Z'),
      ('curated-portkey-gateway', 'Portkey Gateway', 'https://github.com/Portkey-AI/gateway', 'github', 'eval-observability', 'Open-source AI gateway for routing, fallbacks, guardrails', 'Open-source AI-gateway voor routing, fallbacks en guardrails', 'approved', 'curated', '2023-08-23', '2023-08-23T12:00:00Z'),
      ('curated-ragchecker', 'RAGChecker', 'https://github.com/amazon-science/RAGChecker', 'github', 'eval-observability', 'Fine-grained diagnosis and evaluation for RAG systems', 'Fijnmazige diagnose en evaluatie voor RAG-systemen', 'approved', 'curated', '2024-06-24', '2024-06-24T12:00:00Z'),
      ('curated-langchain', 'LangChain', 'https://github.com/langchain-ai/langchain', 'github', 'frameworks', 'Composable framework for LLM apps, tools, memory, and agents', 'Composeerbaar framework voor LLM-apps, tools, geheugen en agents', 'approved', 'curated', '2022-10-17', '2022-10-17T12:00:00Z'),
      ('curated-autogen', 'AutoGen', 'https://github.com/microsoft/autogen', 'github', 'frameworks', 'Multi-agent conversation framework from Microsoft Research', 'Multi-agent-conversatieframework van Microsoft Research', 'approved', 'curated', '2023-08-18', '2023-08-18T12:00:00Z'),
      ('curated-crewai', 'CrewAI', 'https://github.com/crewAIInc/crewAI', 'github', 'frameworks', 'Role-playing multi-agent orchestration framework', 'Role-playing multi-agent-orchestratieframework', 'approved', 'curated', '2023-10-27', '2023-10-27T12:00:00Z'),
      ('curated-semantic-kernel', 'Semantic Kernel', 'https://github.com/microsoft/semantic-kernel', 'github', 'frameworks', 'Enterprise SDK for AI agents and orchestration (.NET/Python/Java)', 'Enterprise-SDK voor AI-agents en orchestratie (.NET/Python/Java)', 'approved', 'curated', '2023-02-27', '2023-02-27T12:00:00Z'),
      ('curated-aider', 'Aider', 'https://github.com/Aider-AI/aider', 'github', 'frameworks', 'AI pair programming in the terminal that edits local git repos', 'AI-pair-programming in de terminal die lokale git-repo’s bewerkt', 'approved', 'curated', '2023-05-09', '2023-05-09T12:00:00Z'),
      ('curated-smolagents', 'Smolagents', 'https://github.com/huggingface/smolagents', 'github', 'frameworks', 'Barebones Hugging Face library for code-writing and tool-calling agents', 'Kale Hugging Face-library voor code-schrijvende en tool-calling agents', 'approved', 'curated', '2024-12-05', '2024-12-05T12:00:00Z'),
      ('curated-deepagents', 'Deep Agents', 'https://github.com/langchain-ai/deepagents', 'github', 'frameworks', 'Batteries-included agent harness built on LangChain', 'Agent-harness met batterijen inbegrepen, gebouwd op LangChain', 'approved', 'curated', '2025-07-27', '2025-07-27T12:00:00Z'),
      ('curated-ag2', 'AG2', 'https://github.com/ag2ai/ag2', 'github', 'frameworks', 'Open-source AgentOS multi-agent framework (AutoGen lineage)', 'Open-source AgentOS multi-agent-framework (AutoGen-lijn)', 'approved', 'curated', '2024-11-11', '2024-11-11T12:00:00Z'),
      ('curated-camel', 'CAMEL', 'https://github.com/camel-ai/camel', 'github', 'frameworks', 'Communicative multi-agent framework for role-playing agents', 'Communicatief multi-agent-framework voor role-playing agents', 'approved', 'curated', '2023-03-17', '2023-03-17T12:00:00Z'),
      ('curated-mastra', 'Mastra', 'https://github.com/mastra-ai/mastra', 'github', 'frameworks', 'TypeScript agent framework with workflows, memory, and tools', 'TypeScript-agentframework met workflows, geheugen en tools', 'approved', 'curated', '2024-08-06', '2024-08-06T12:00:00Z'),
      ('curated-eliza', 'Eliza', 'https://github.com/elizaOS/eliza', 'github', 'frameworks', 'Multi-agent framework for autonomous character agents', 'Multi-agent-framework voor autonome karakteragents', 'approved', 'curated', '2024-07-09', '2024-07-09T12:00:00Z'),
      ('curated-n8n', 'n8n', 'https://github.com/n8n-io/n8n', 'github', 'frameworks', 'Fair-code workflow automation platform with AI agent nodes', 'Fair-code workflow-automatisering met AI-agentnodes', 'approved', 'curated', '2019-06-22', '2019-06-22T12:00:00Z'),
      ('curated-griptape', 'Griptape', 'https://github.com/griptape-ai/griptape', 'github', 'frameworks', 'Python framework for building AI agents and secure workflows', 'Python-framework voor AI-agents en veilige workflows', 'approved', 'curated', '2023-01-14', '2023-01-14T12:00:00Z'),
      ('curated-google-adk', 'Google ADK', 'https://github.com/google/adk-python', 'github', 'frameworks', 'Agent Development Kit for building multi-agent systems', 'Agent Development Kit voor het bouwen van multi-agent-systemen', 'approved', 'curated', '2025-04-01', '2025-04-01T12:00:00Z'),
      ('curated-autogpt', 'AutoGPT', 'https://github.com/Significant-Gravitas/AutoGPT', 'github', 'frameworks', 'Autonomous AI agent platform for goal-driven task execution', 'Autonoom AI-agentplatform voor doelgedreven taakuitvoering', 'approved', 'curated', '2023-03-16', '2023-03-16T12:00:00Z'),
      ('curated-openmanus', 'OpenManus', 'https://github.com/FoundationAgents/OpenManus', 'github', 'frameworks', 'Open-source general AI agent inspired by Manus', 'Open-source algemene AI-agent, geïnspireerd door Manus', 'approved', 'curated', '2025-03-06', '2025-03-06T12:00:00Z'),
      ('curated-vercel-ai-sdk', 'Vercel AI SDK', 'https://github.com/vercel/ai', 'github', 'frameworks', 'TypeScript toolkit for building AI apps and streaming UIs', 'TypeScript-toolkit voor AI-apps en streaming-UI’s', 'approved', 'curated', '2023-05-23', '2023-05-23T12:00:00Z'),
      ('curated-taskweaver', 'TaskWeaver', 'https://github.com/microsoft/TaskWeaver', 'github', 'frameworks', 'Code-first agent framework for data analytics tasks', 'Code-first agentframework voor data-analysetaken', 'approved', 'curated', '2023-09-11', '2023-09-11T12:00:00Z')
    ON CONFLICT ("repo_url") DO NOTHING;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."awesome_ai_oss_project"
    WHERE "id" IN (
      'curated-sqlite-vec', 'curated-unstructured', 'curated-docling',
      'curated-markitdown', 'curated-mineru', 'curated-sentence-transformers',
      'curated-llamaindex', 'curated-anythingllm', 'curated-khoj',
      'curated-librechat', 'curated-dify', 'curated-open-webui',
      'curated-continue', 'curated-gpt-researcher', 'curated-firecrawl',
      'curated-browser-use', 'curated-searxng', 'curated-jina-reader',
      'curated-open-deep-research', 'curated-storm', 'curated-crawl4ai',
      'curated-langfuse', 'curated-promptfoo', 'curated-ragas',
      'curated-deepeval', 'curated-giskard', 'curated-trulens',
      'curated-phoenix', 'curated-helicone', 'curated-litellm',
      'curated-portkey-gateway', 'curated-ragchecker', 'curated-langchain',
      'curated-autogen', 'curated-crewai', 'curated-semantic-kernel',
      'curated-aider', 'curated-smolagents', 'curated-deepagents',
      'curated-ag2', 'curated-camel', 'curated-mastra', 'curated-eliza',
      'curated-n8n', 'curated-griptape', 'curated-google-adk',
      'curated-autogpt', 'curated-openmanus', 'curated-vercel-ai-sdk',
      'curated-taskweaver'
    );
  `);
}
