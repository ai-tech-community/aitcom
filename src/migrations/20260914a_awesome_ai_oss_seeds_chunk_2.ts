// Additive curated seeds for Awesome AI OSS chunk 2/6 (+50 live GitHub
// projects). Matches awesome_ai_oss_* from #272. ON CONFLICT skips any
// repo_url already listed (v1 or a chunk-1 PR that lands first).
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    INSERT INTO "app"."awesome_ai_oss_project" (
      "id", "name", "repo_url", "repo_host", "category",
      "blurb_en", "blurb_nl", "status", "source", "added_on", "created_at"
    ) VALUES
      ('curated-notion-mcp-server', 'makenotion/notion-mcp-server', 'https://github.com/makenotion/notion-mcp-server', 'github', 'runtimes', 'Official Notion MCP server', 'Officiële Notion-MCP-server', 'approved', 'curated', '2025-03-10', '2025-03-10T12:00:00Z'),
      ('curated-devhub-cms-mcp', 'devhub/devhub-cms-mcp', 'https://github.com/devhub/devhub-cms-mcp', 'github', 'runtimes', 'DevHub CMS MCP server', 'DevHub CMS MCP-server', 'approved', 'curated', '2025-03-17', '2025-03-17T12:00:00Z'),
      ('curated-heroku-mcp-server', 'heroku/heroku-mcp-server', 'https://github.com/heroku/heroku-mcp-server', 'github', 'runtimes', 'Official Heroku MCP server', 'Officiële Heroku-MCP-server', 'approved', 'curated', '2025-03-26', '2025-03-26T12:00:00Z'),
      ('curated-baidu-maps-mcp', 'baidu-maps/mcp', 'https://github.com/baidu-maps/mcp', 'github', 'runtimes', 'Baidu Maps MCP server', 'Baidu Maps MCP-server', 'approved', 'curated', '2025-03-20', '2025-03-20T12:00:00Z'),
      ('curated-solana-dev-mcp', 'solana-foundation/solana-dev-mcp', 'https://github.com/solana-foundation/solana-dev-mcp', 'github', 'runtimes', 'Solana developer MCP server', 'Solana-developer-MCP-server', 'approved', 'curated', '2025-03-09', '2025-03-09T12:00:00Z'),
      ('curated-onchain-mcp', 'bankless/onchain-mcp', 'https://github.com/bankless/onchain-mcp', 'github', 'runtimes', 'Bankless onchain MCP server', 'Bankless onchain-MCP-server', 'approved', 'curated', '2025-03-10', '2025-03-10T12:00:00Z'),
      ('curated-opik-mcp', 'comet-ml/opik-mcp', 'https://github.com/comet-ml/opik-mcp', 'github', 'runtimes', 'Opik MCP server for LLM observability', 'Opik-MCP-server voor LLM-observability', 'approved', 'curated', '2025-03-11', '2025-03-11T12:00:00Z'),
      ('curated-dynatrace-mcp', 'dynatrace-oss/dynatrace-mcp', 'https://github.com/dynatrace-oss/dynatrace-mcp', 'github', 'runtimes', 'Dynatrace MCP server', 'Dynatrace-MCP-server', 'approved', 'curated', '2025-04-23', '2025-04-23T12:00:00Z'),
      ('curated-mcp-grafana', 'grafana/mcp-grafana', 'https://github.com/grafana/mcp-grafana', 'github', 'runtimes', 'Official Grafana MCP server', 'Officiële Grafana-MCP-server', 'approved', 'curated', '2024-12-24', '2024-12-24T12:00:00Z'),
      ('curated-terraform-mcp-server', 'hashicorp/terraform-mcp-server', 'https://github.com/hashicorp/terraform-mcp-server', 'github', 'runtimes', 'Official HashiCorp Terraform MCP server', 'Officiële HashiCorp Terraform-MCP-server', 'approved', 'curated', '2025-04-19', '2025-04-19T12:00:00Z'),
      ('curated-trivy-mcp', 'aquasecurity/trivy-mcp', 'https://github.com/aquasecurity/trivy-mcp', 'github', 'runtimes', 'Trivy MCP server for security scanning', 'Trivy-MCP-server voor security-scanning', 'approved', 'curated', '2025-04-24', '2025-04-24T12:00:00Z'),
      ('curated-hf-mcp-server', 'huggingface/hf-mcp-server', 'https://github.com/huggingface/hf-mcp-server', 'github', 'runtimes', 'Hugging Face Hub MCP server', 'Hugging Face Hub MCP-server', 'approved', 'curated', '2025-05-06', '2025-05-06T12:00:00Z'),
      ('curated-smithery-cli', 'smithery-ai/cli', 'https://github.com/smithery-ai/cli', 'github', 'runtimes', 'Smithery CLI to discover and run MCP servers', 'Smithery-CLI om MCP-servers te vinden en te draaien', 'approved', 'curated', '2024-12-22', '2024-12-22T12:00:00Z'),
      ('curated-template-mcp-server', 'mcpdotdirect/template-mcp-server', 'https://github.com/mcpdotdirect/template-mcp-server', 'github', 'protocols', 'Template for building custom MCP servers', 'Template voor eigen MCP-servers', 'approved', 'curated', '2025-03-10', '2025-03-10T12:00:00Z'),
      ('curated-atlas-mcp-server', 'cyanheads/atlas-mcp-server', 'https://github.com/cyanheads/atlas-mcp-server', 'github', 'runtimes', 'ATLAS knowledge-graph MCP memory server', 'ATLAS knowledge-graph MCP-geheugenserver', 'approved', 'curated', '2024-12-16', '2024-12-16T12:00:00Z'),
      ('curated-mcp-memory-service', 'doobidoo/mcp-memory-service', 'https://github.com/doobidoo/mcp-memory-service', 'github', 'runtimes', 'Semantic memory MCP service with embeddings', 'Semantische-geheugen-MCP-service met embeddings', 'approved', 'curated', '2024-12-26', '2024-12-26T12:00:00Z'),
      ('curated-mcp-miro', 'evalstate/mcp-miro', 'https://github.com/evalstate/mcp-miro', 'github', 'runtimes', 'Miro board MCP server', 'Miro-board-MCP-server', 'approved', 'curated', '2024-11-28', '2024-11-28T12:00:00Z'),
      ('curated-blender-mcp', 'ahujasid/blender-mcp', 'https://github.com/ahujasid/blender-mcp', 'github', 'runtimes', 'Blender MCP server for 3D scene control', 'Blender-MCP-server voor 3D-scènebesturing', 'approved', 'curated', '2025-03-07', '2025-03-07T12:00:00Z'),
      ('curated-mcp-obsidian', 'MarkusPfundstein/mcp-obsidian', 'https://github.com/MarkusPfundstein/mcp-obsidian', 'github', 'runtimes', 'MCP server for Obsidian notes', 'MCP-server voor Obsidian-notities', 'approved', 'curated', '2024-11-29', '2024-11-29T12:00:00Z'),
      ('curated-mcp-server-openai', 'pierrebrunelle/mcp-server-openai', 'https://github.com/pierrebrunelle/mcp-server-openai', 'github', 'runtimes', 'Bridge OpenAI APIs through MCP', 'Brug van OpenAI-API’s via MCP', 'approved', 'curated', '2024-11-28', '2024-11-28T12:00:00Z'),
      ('curated-agno', 'Agno', 'https://github.com/agno-agi/agno', 'github', 'frameworks', 'Python framework to build, run, and manage multi-agent platforms (formerly Phidata)', 'Python-framework om multi-agent-platforms te bouwen, draaien en beheren (voorheen Phidata)', 'approved', 'curated', '2022-05-04', '2022-05-04T12:00:00Z'),
      ('curated-pydantic-ai', 'PydanticAI', 'https://github.com/pydantic/pydantic-ai', 'github', 'frameworks', 'Type-safe Python agent framework from the Pydantic team', 'Typeveilig Python-agentframework van het Pydantic-team', 'approved', 'curated', '2024-06-21', '2024-06-21T12:00:00Z'),
      ('curated-instructor', 'Instructor', 'https://github.com/567-labs/instructor', 'github', 'frameworks', 'Structured LLM outputs via Pydantic validation', 'Gestructureerde LLM-output via Pydantic-validatie', 'approved', 'curated', '2023-06-14', '2023-06-14T12:00:00Z'),
      ('curated-outlines', 'Outlines', 'https://github.com/dottxt-ai/outlines', 'github', 'frameworks', 'Structured generation and constrained decoding for LLMs', 'Gestructureerde generatie en constrained decoding voor LLMs', 'approved', 'curated', '2023-03-17', '2023-03-17T12:00:00Z'),
      ('curated-dspy', 'DSPy', 'https://github.com/stanfordnlp/dspy', 'github', 'frameworks', 'Framework for programming—not prompting—language-model pipelines', 'Framework om taalmodel-pipelines te programmeren, niet te prompten', 'approved', 'curated', '2023-01-09', '2023-01-09T12:00:00Z'),
      ('curated-guidance', 'Guidance', 'https://github.com/guidance-ai/guidance', 'github', 'frameworks', 'Guidance language for controlling large language model generation', 'Guidance-taal voor het sturen van LLM-generatie', 'approved', 'curated', '2022-11-10', '2022-11-10T12:00:00Z'),
      ('curated-babyagi', 'BabyAGI', 'https://github.com/yoheinakajima/babyagi', 'github', 'frameworks', 'Historical task-driven autonomous agent loop', 'Historische taakgedreven autonome agent-loop', 'approved', 'curated', '2023-04-03', '2023-04-03T12:00:00Z'),
      ('curated-metagpt', 'MetaGPT', 'https://github.com/FoundationAgents/MetaGPT', 'github', 'frameworks', 'Multi-agent framework that simulates a software company', 'Multi-agent-framework dat een softwarebedrijf simuleert', 'approved', 'curated', '2023-06-30', '2023-06-30T12:00:00Z'),
      ('curated-chatdev', 'ChatDev', 'https://github.com/OpenBMB/ChatDev', 'github', 'frameworks', 'Communicative multi-agent framework for collaborative software development', 'Communicatief multi-agent-framework voor collaboratieve softwareontwikkeling', 'approved', 'curated', '2023-08-28', '2023-08-28T12:00:00Z'),
      ('curated-openhands', 'OpenHands', 'https://github.com/OpenHands/OpenHands', 'github', 'frameworks', 'Open software-engineering agent platform (formerly OpenDevin / All-Hands-AI)', 'Open software-engineering-agentplatform (voorheen OpenDevin / All-Hands-AI)', 'approved', 'curated', '2024-03-13', '2024-03-13T12:00:00Z'),
      ('curated-swe-agent', 'SWE-agent', 'https://github.com/SWE-agent/SWE-agent', 'github', 'frameworks', 'Agent that uses a computer interface to automatically fix GitHub issues', 'Agent die via een computerinterface automatisch GitHub-issues fixt', 'approved', 'curated', '2024-04-02', '2024-04-02T12:00:00Z'),
      ('curated-superagent', 'Superagent', 'https://github.com/superagent-ai/superagent', 'github', 'frameworks', 'Guardrails runtime for AI apps against prompt injection and data leaks', 'Guardrails-runtime voor AI-apps tegen prompt injection en datalekken', 'approved', 'curated', '2023-05-10', '2023-05-10T12:00:00Z'),
      ('curated-haystack', 'Haystack', 'https://github.com/deepset-ai/haystack', 'github', 'rag', 'Open-source orchestration framework for production RAG and LLM applications', 'Open-source orchestratieframework voor productie-RAG en LLM-apps', 'approved', 'curated', '2019-11-14', '2019-11-14T12:00:00Z'),
      ('curated-txtai', 'txtai', 'https://github.com/neuml/txtai', 'github', 'rag', 'All-in-one embeddings, semantic search, and RAG workflow framework', 'All-in-one embeddings, semantisch zoeken en RAG-workflowframework', 'approved', 'curated', '2020-08-09', '2020-08-09T12:00:00Z'),
      ('curated-private-gpt', 'PrivateGPT', 'https://github.com/zylon-ai/private-gpt', 'github', 'rag', 'Private local RAG API over documents and local models', 'Privé lokale RAG-API over documenten en lokale modellen', 'approved', 'curated', '2023-05-02', '2023-05-02T12:00:00Z'),
      ('curated-quivr', 'Quivr', 'https://github.com/The-Vibe-Company/quivr', 'github', 'rag', 'Opinionated RAG platform for integrating GenAI into applications', 'Opinionated RAG-platform om GenAI in apps te integreren', 'approved', 'curated', '2023-05-12', '2023-05-12T12:00:00Z'),
      ('curated-ragflow', 'RAGFlow', 'https://github.com/infiniflow/ragflow', 'github', 'rag', 'Open-source RAG engine with deep document understanding', 'Open-source RAG-engine met diep documentbegrip', 'approved', 'curated', '2023-12-12', '2023-12-12T12:00:00Z'),
      ('curated-lightrag', 'LightRAG', 'https://github.com/HKUDS/LightRAG', 'github', 'rag', 'Simple, fast graph-based retrieval-augmented generation', 'Eenvoudige, snelle graafgebaseerde retrieval-augmented generation', 'approved', 'curated', '2024-10-02', '2024-10-02T12:00:00Z'),
      ('curated-graphrag', 'GraphRAG', 'https://github.com/microsoft/graphrag', 'github', 'rag', 'Modular graph-based RAG for extracting structured knowledge from text', 'Modulaire graafgebaseerde RAG om gestructureerde kennis uit tekst te halen', 'approved', 'curated', '2024-03-27', '2024-03-27T12:00:00Z'),
      ('curated-mem0', 'mem0', 'https://github.com/mem0ai/mem0', 'github', 'rag', 'Drop-in memory layer for AI agents and apps', 'Drop-in geheugenlaag voor AI-agents en apps', 'approved', 'curated', '2023-06-20', '2023-06-20T12:00:00Z'),
      ('curated-graphiti', 'Graphiti', 'https://github.com/getzep/graphiti', 'github', 'rag', 'Real-time temporal knowledge graphs for agent memory', 'Realtime temporele knowledge graphs voor agentgeheugen', 'approved', 'curated', '2024-08-08', '2024-08-08T12:00:00Z'),
      ('curated-letta', 'Letta', 'https://github.com/letta-ai/letta', 'github', 'rag', 'Stateful agent runtime with long-term memory (formerly MemGPT)', 'Stateful agent-runtime met langetermijngeheugen (voorheen MemGPT)', 'approved', 'curated', '2023-10-11', '2023-10-11T12:00:00Z'),
      ('curated-cognee', 'cognee', 'https://github.com/topoteretes/cognee', 'github', 'rag', 'Open-source AI memory platform that builds knowledge graphs for agents', 'Open-source AI-geheugenplatform dat knowledge graphs voor agents bouwt', 'approved', 'curated', '2023-08-16', '2023-08-16T12:00:00Z'),
      ('curated-qdrant', 'Qdrant', 'https://github.com/qdrant/qdrant', 'github', 'rag', 'Open-source vector database and similarity search engine', 'Open-source vectordatabase en similarity-search-engine', 'approved', 'curated', '2020-05-30', '2020-05-30T12:00:00Z'),
      ('curated-milvus', 'Milvus', 'https://github.com/milvus-io/milvus', 'github', 'rag', 'Cloud-native open-source vector database for ANN search', 'Cloud-native open-source vectordatabase voor ANN-search', 'approved', 'curated', '2019-09-16', '2019-09-16T12:00:00Z'),
      ('curated-weaviate', 'Weaviate', 'https://github.com/weaviate/weaviate', 'github', 'rag', 'Open-source vector database with hybrid search', 'Open-source vectordatabase met hybride search', 'approved', 'curated', '2016-03-30', '2016-03-30T12:00:00Z'),
      ('curated-chroma', 'Chroma', 'https://github.com/chroma-core/chroma', 'github', 'rag', 'Open-source embedding database for AI apps', 'Open-source embedding-database voor AI-apps', 'approved', 'curated', '2022-10-05', '2022-10-05T12:00:00Z'),
      ('curated-lancedb', 'LanceDB', 'https://github.com/lancedb/lancedb', 'github', 'rag', 'Embedded multimodal retrieval database built on Lance', 'Embedded multimodale retrieval-database op Lance', 'approved', 'curated', '2023-02-28', '2023-02-28T12:00:00Z'),
      ('curated-pgvector', 'pgvector', 'https://github.com/pgvector/pgvector', 'github', 'rag', 'Vector similarity search for Postgres', 'Vector-similarity-search voor Postgres', 'approved', 'curated', '2021-04-20', '2021-04-20T12:00:00Z'),
      ('curated-faiss', 'Faiss', 'https://github.com/facebookresearch/faiss', 'github', 'rag', 'Efficient similarity search and clustering of dense vectors', 'Efficiënte similarity-search en clustering van dichte vectoren', 'approved', 'curated', '2017-02-07', '2017-02-07T12:00:00Z')
    ON CONFLICT ("repo_url") DO NOTHING;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."awesome_ai_oss_project"
    WHERE "id" IN (
      'curated-notion-mcp-server',
      'curated-devhub-cms-mcp',
      'curated-heroku-mcp-server',
      'curated-baidu-maps-mcp',
      'curated-solana-dev-mcp',
      'curated-onchain-mcp',
      'curated-opik-mcp',
      'curated-dynatrace-mcp',
      'curated-mcp-grafana',
      'curated-terraform-mcp-server',
      'curated-trivy-mcp',
      'curated-hf-mcp-server',
      'curated-smithery-cli',
      'curated-template-mcp-server',
      'curated-atlas-mcp-server',
      'curated-mcp-memory-service',
      'curated-mcp-miro',
      'curated-blender-mcp',
      'curated-mcp-obsidian',
      'curated-mcp-server-openai',
      'curated-agno',
      'curated-pydantic-ai',
      'curated-instructor',
      'curated-outlines',
      'curated-dspy',
      'curated-guidance',
      'curated-babyagi',
      'curated-metagpt',
      'curated-chatdev',
      'curated-openhands',
      'curated-swe-agent',
      'curated-superagent',
      'curated-haystack',
      'curated-txtai',
      'curated-private-gpt',
      'curated-quivr',
      'curated-ragflow',
      'curated-lightrag',
      'curated-graphrag',
      'curated-mem0',
      'curated-graphiti',
      'curated-letta',
      'curated-cognee',
      'curated-qdrant',
      'curated-milvus',
      'curated-weaviate',
      'curated-chroma',
      'curated-lancedb',
      'curated-pgvector',
      'curated-faiss'
    );
  `);
}
