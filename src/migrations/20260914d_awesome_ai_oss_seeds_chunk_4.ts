// Additive chunk 4/6: 50 approved curated GitHub seeds for the live
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
      ('curated-plandex', 'Plandex', 'https://github.com/plandex-ai/plandex', 'github', 'frameworks', 'AI coding agent for large projects in the terminal', 'AI-codeeragent voor grote projecten in de terminal', 'approved', 'curated', '2023-10-24', '2023-10-24T12:00:00Z'),
      ('curated-dzhng-deep-research', 'Open Deep Research', 'https://github.com/dzhng/deep-research', 'github', 'frameworks', 'AI agent that conducts iterative web research', 'AI-agent die iteratief webonderzoek uitvoert', 'approved', 'curated', '2025-02-04', '2025-02-04T12:00:00Z'),
      ('curated-deer-flow', 'DeerFlow', 'https://github.com/bytedance/deer-flow', 'github', 'frameworks', 'ByteDance deep research / agent workflow framework', 'ByteDance deep-research- / agent-workflowframework', 'approved', 'curated', '2025-05-07', '2025-05-07T12:00:00Z'),
      ('curated-rag-anything', 'RAG-Anything', 'https://github.com/HKUDS/RAG-Anything', 'github', 'rag', 'All-in-one multimodal RAG for text, images, tables, and equations', 'Alles-in-één multimodale RAG voor tekst, beelden, tabellen en formules', 'approved', 'curated', '2025-06-06', '2025-06-06T12:00:00Z'),
      ('curated-kotaemon', 'Kotaemon', 'https://github.com/cinnamon/kotaemon', 'github', 'rag', 'Clean open-source RAG UI for chatting with your documents', 'Schone open-source RAG-UI om te chatten met je documenten', 'approved', 'curated', '2024-03-25', '2024-03-25T12:00:00Z'),
      ('curated-flagembedding', 'FlagEmbedding', 'https://github.com/FlagOpen/FlagEmbedding', 'github', 'rag', 'BGE embedding and retrieval toolkit for RAG systems', 'BGE-embedding- en retrieval-toolkit voor RAG-systemen', 'approved', 'curated', '2023-08-02', '2023-08-02T12:00:00Z'),
      ('curated-colbert', 'ColBERT', 'https://github.com/stanford-futuredata/ColBERT', 'github', 'rag', 'Late-interaction retrieval toolkit for high-quality RAG', 'Late-interaction retrieval-toolkit voor hoogwaardige RAG', 'approved', 'curated', '2020-05-25', '2020-05-25T12:00:00Z'),
      ('curated-vespa', 'Vespa', 'https://github.com/vespa-engine/vespa', 'github', 'rag', 'Big data serving engine with native vector search', 'Big-data-serving-engine met native vectorzoeken', 'approved', 'curated', '2016-06-03', '2016-06-03T12:00:00Z'),
      ('curated-pathway', 'Pathway', 'https://github.com/pathwaycom/pathway', 'github', 'rag', 'Realtime data processing framework for live RAG pipelines', 'Realtime dataverwerkingsframework voor live RAG-pipelines', 'approved', 'curated', '2022-11-27', '2022-11-27T12:00:00Z'),
      ('curated-falkordb', 'FalkorDB', 'https://github.com/falkordb/falkordb', 'github', 'rag', 'Graph database optimized for GraphRAG workloads', 'Grafendatabase geoptimaliseerd voor GraphRAG-workloads', 'approved', 'curated', '2023-07-20', '2023-07-20T12:00:00Z'),
      ('curated-pgai', 'pgai', 'https://github.com/timescale/pgai', 'github', 'rag', 'PostgreSQL extension tooling for AI and RAG workflows', 'PostgreSQL-extensietooling voor AI- en RAG-workflows', 'approved', 'curated', '2024-05-16', '2024-05-16T12:00:00Z'),
      ('curated-supermemory', 'Supermemory', 'https://github.com/supermemoryai/supermemory', 'github', 'rag', 'Personal infinite memory API designed for AI apps', 'Persoonlijke oneindige-geheugen-API voor AI-apps', 'approved', 'curated', '2024-02-27', '2024-02-27T12:00:00Z'),
      ('curated-flowise', 'Flowise', 'https://github.com/flowiseai/flowise', 'github', 'agent-uis', 'Drag-and-drop UI to build LLM flows and agents', 'Drag-and-drop-UI om LLM-flows en agents te bouwen', 'approved', 'curated', '2023-03-31', '2023-03-31T12:00:00Z'),
      ('curated-chainlit', 'Chainlit', 'https://github.com/Chainlit/chainlit', 'github', 'agent-uis', 'Python framework to build conversational AI UIs quickly', 'Python-framework om snel conversationele AI-UI’s te bouwen', 'approved', 'curated', '2023-03-14', '2023-03-14T12:00:00Z'),
      ('curated-cline', 'Cline', 'https://github.com/cline/cline', 'github', 'agent-uis', 'Autonomous coding agent extension for VS Code', 'Autonome codeeragent-extensie voor VS Code', 'approved', 'curated', '2024-07-06', '2024-07-06T12:00:00Z'),
      ('curated-roo-code', 'Roo Code', 'https://github.com/RooCodeInc/Roo-Code', 'github', 'agent-uis', 'AI-powered autonomous coding agent for VS Code', 'AI-gedreven autonome codeeragent voor VS Code', 'approved', 'curated', '2024-10-31', '2024-10-31T12:00:00Z'),
      ('curated-tabby', 'Tabby', 'https://github.com/TabbyML/tabby', 'github', 'agent-uis', 'Self-hosted open-source AI coding assistant', 'Zelf-gehoste open-source AI-codeerassistent', 'approved', 'curated', '2023-03-16', '2023-03-16T12:00:00Z'),
      ('curated-copilotkit', 'CopilotKit', 'https://github.com/copilotkit/copilotkit', 'github', 'agent-uis', 'React UI primitives for in-app AI copilots', 'React-UI-primitives voor in-app AI-copilots', 'approved', 'curated', '2023-06-19', '2023-06-19T12:00:00Z'),
      ('curated-assistant-ui', 'assistant-ui', 'https://github.com/assistant-ui/assistant-ui', 'github', 'agent-uis', 'React components for building AI chat interfaces', 'React-componenten voor AI-chatinterfaces', 'approved', 'curated', '2023-11-22', '2023-11-22T12:00:00Z'),
      ('curated-void', 'Void', 'https://github.com/voideditor/void', 'github', 'agent-uis', 'Open-source Cursor-like AI code editor', 'Open-source Cursor-achtige AI-code-editor', 'approved', 'curated', '2024-09-11', '2024-09-11T12:00:00Z'),
      ('curated-gpt4all', 'GPT4All', 'https://github.com/nomic-ai/gpt4all', 'github', 'agent-uis', 'Local chatbot ecosystem for running LLMs offline', 'Lokaal chatbot-ecosysteem om LLM’s offline te draaien', 'approved', 'curated', '2023-03-27', '2023-03-27T12:00:00Z'),
      ('curated-sillytavern', 'SillyTavern', 'https://github.com/SillyTavern/SillyTavern', 'github', 'agent-uis', 'Local LLM frontend for character chat and extensions', 'Lokale LLM-frontend voor karakterchat en extensies', 'approved', 'curated', '2023-02-09', '2023-02-09T12:00:00Z'),
      ('curated-skyvern', 'Skyvern', 'https://github.com/Skyvern-AI/skyvern', 'github', 'agent-tools', 'Browser automation with LLMs and computer vision', 'Browserautomatisering met LLM’s en computer vision', 'approved', 'curated', '2024-02-28', '2024-02-28T12:00:00Z'),
      ('curated-stagehand', 'Stagehand', 'https://github.com/browserbase/stagehand', 'github', 'agent-tools', 'Browser automation framework for AI agents from Browserbase', 'Browserautomatiseringsframework voor AI-agents van Browserbase', 'approved', 'curated', '2024-03-24', '2024-03-24T12:00:00Z'),
      ('curated-crawlee', 'Crawlee', 'https://github.com/apify/crawlee', 'github', 'agent-tools', 'Web scraping and browser automation library for Node.js', 'Webscraping- en browserautomatiseringslibrary voor Node.js', 'approved', 'curated', '2016-08-26', '2016-08-26T12:00:00Z'),
      ('curated-e2b', 'E2B', 'https://github.com/e2b-dev/E2B', 'github', 'agent-tools', 'Secure cloud sandboxes for AI agents and code execution', 'Veilige cloudsandboxes voor AI-agents en code-uitvoering', 'approved', 'curated', '2023-03-04', '2023-03-04T12:00:00Z'),
      ('curated-composio', 'Composio', 'https://github.com/ComposioHQ/composio', 'github', 'agent-tools', 'Toolset connecting agents to hundreds of external apps', 'Toolset die agents verbindt met honderden externe apps', 'approved', 'curated', '2024-02-23', '2024-02-23T12:00:00Z'),
      ('curated-guardrails', 'Guardrails', 'https://github.com/guardrails-ai/guardrails', 'github', 'agent-tools', 'Add structure and validation guards around LLM inputs/outputs', 'Voeg structuur- en validatieguards toe rond LLM-invoer/uitvoer', 'approved', 'curated', '2023-01-29', '2023-01-29T12:00:00Z'),
      ('curated-agentops', 'AgentOps', 'https://github.com/AgentOps-AI/agentops', 'github', 'agent-tools', 'Observability and testing toolkit for AI agents', 'Observability- en testtoolkit voor AI-agents', 'approved', 'curated', '2023-08-15', '2023-08-15T12:00:00Z'),
      ('curated-trafilatura', 'Trafilatura', 'https://github.com/adbar/trafilatura', 'github', 'agent-tools', 'Web scraping library focused on main-text extraction for LLMs', 'Webscraping-library gericht op hoofdtekstextractie voor LLMs', 'approved', 'curated', '2019-04-08', '2019-04-08T12:00:00Z'),
      ('curated-microsoft-playwright-mcp', 'Playwright MCP', 'https://github.com/microsoft/playwright-mcp', 'github', 'agent-tools', 'MCP server exposing Playwright browser automation to agents', 'MCP-server die Playwright-browserautomatisering aan agents blootstelt', 'approved', 'curated', '2025-03-21', '2025-03-21T12:00:00Z'),
      ('curated-daytona', 'Daytona', 'https://github.com/daytonaio/daytona', 'github', 'agent-tools', 'Secure elastic infrastructure for running AI-generated code', 'Veilige elastische infrastructuur om AI-gegenereerde code te draaien', 'approved', 'curated', '2024-02-06', '2024-02-06T12:00:00Z'),
      ('curated-openlit', 'OpenLIT', 'https://github.com/openlit/openlit', 'github', 'agent-tools', 'OpenTelemetry-native GenAI and agent observability', 'OpenTelemetry-native GenAI- en agent-observability', 'approved', 'curated', '2024-01-23', '2024-01-23T12:00:00Z'),
      ('curated-llm-guard', 'LLM Guard', 'https://github.com/ProtectAI/llm-guard', 'github', 'agent-tools', 'Security toolkit for scanning and guarding LLM interactions', 'Security-toolkit voor het scannen en bewaken van LLM-interacties', 'approved', 'curated', '2023-07-27', '2023-07-27T12:00:00Z'),
      ('curated-llama-cpp', 'llama.cpp', 'https://github.com/ggml-org/llama.cpp', 'github', 'models', 'C++ inference engine for running LLMs locally', 'C++-inference-engine om LLM’s lokaal te draaien', 'approved', 'curated', '2023-03-10', '2023-03-10T12:00:00Z'),
      ('curated-whisper-cpp', 'whisper.cpp', 'https://github.com/ggerganov/whisper.cpp', 'github', 'models', 'C++ port of OpenAI Whisper for local speech-to-text', 'C++-port van OpenAI Whisper voor lokale speech-to-text', 'approved', 'curated', '2022-09-25', '2022-09-25T12:00:00Z'),
      ('curated-mlc-llm', 'MLC LLM', 'https://github.com/mlc-ai/mlc-llm', 'github', 'models', 'Universal LLM deployment on phones GPUs and browsers', 'Universele LLM-deployment op telefoons, GPU’s en browsers', 'approved', 'curated', '2023-04-29', '2023-04-29T12:00:00Z'),
      ('curated-tgi', 'TGI', 'https://github.com/huggingface/text-generation-inference', 'github', 'models', 'Hugging Face Text Generation Inference server', 'Hugging Face Text Generation Inference-server', 'approved', 'curated', '2022-10-08', '2022-10-08T12:00:00Z'),
      ('curated-tensorrt-llm', 'TensorRT-LLM', 'https://github.com/NVIDIA/TensorRT-LLM', 'github', 'models', 'NVIDIA optimized LLM inference with TensorRT', 'NVIDIA-geoptimaliseerde LLM-inference met TensorRT', 'approved', 'curated', '2023-08-16', '2023-08-16T12:00:00Z'),
      ('curated-sglang', 'SGLang', 'https://github.com/sgl-project/sglang', 'github', 'models', 'Fast serving framework for large language and vision models', 'Snel serving-framework voor grote taal- en visiemodellen', 'approved', 'curated', '2024-01-08', '2024-01-08T12:00:00Z'),
      ('curated-paddlenlp', 'PaddleNLP', 'https://github.com/PaddlePaddle/PaddleNLP', 'github', 'models', 'Industrial NLP and LLM toolkit from PaddlePaddle', 'Industriële NLP- en LLM-toolkit van PaddlePaddle', 'approved', 'curated', '2021-02-05', '2021-02-05T12:00:00Z'),
      ('curated-axolotl', 'Axolotl', 'https://github.com/OpenAccess-AI-Collective/axolotl', 'github', 'models', 'Tooling to fine-tune many open LLMs', 'Tooling om veel open LLM’s te fine-tunen', 'approved', 'curated', '2023-04-14', '2023-04-14T12:00:00Z'),
      ('curated-unsloth', 'Unsloth', 'https://github.com/unslothai/unsloth', 'github', 'models', 'Faster fine-tuning for LLMs with lower memory', 'Snellere fine-tuning voor LLM’s met minder geheugen', 'approved', 'curated', '2023-11-29', '2023-11-29T12:00:00Z'),
      ('curated-peft', 'PEFT', 'https://github.com/huggingface/peft', 'github', 'models', 'Parameter-efficient fine-tuning methods for Transformers', 'Parameter-efficiënte fine-tuningmethoden voor Transformers', 'approved', 'curated', '2022-11-25', '2022-11-25T12:00:00Z'),
      ('curated-trl', 'TRL', 'https://github.com/huggingface/trl', 'github', 'models', 'Transformer Reinforcement Learning library for alignment', 'Transformer Reinforcement Learning-library voor alignment', 'approved', 'curated', '2020-03-27', '2020-03-27T12:00:00Z'),
      ('curated-accelerate', 'Accelerate', 'https://github.com/huggingface/accelerate', 'github', 'models', 'Training and inference helpers for multi-GPU and TPU', 'Training- en inference-helpers voor multi-GPU en TPU', 'approved', 'curated', '2020-10-30', '2020-10-30T12:00:00Z'),
      ('curated-diffusers', 'Diffusers', 'https://github.com/huggingface/diffusers', 'github', 'models', 'State-of-the-art diffusion model pipelines', 'State-of-the-art diffusion-modelpipelines', 'approved', 'curated', '2022-05-30', '2022-05-30T12:00:00Z'),
      ('curated-tokenizers', 'Tokenizers', 'https://github.com/huggingface/tokenizers', 'github', 'models', 'Fast Rust-backed tokenizers used across HF models', 'Snelle Rust-backed tokenizers gebruikt in HF-modellen', 'approved', 'curated', '2019-11-01', '2019-11-01T12:00:00Z'),
      ('curated-gpt-neox', 'GPT-NeoX', 'https://github.com/EleutherAI/gpt-neox', 'github', 'models', 'Large-scale autoregressive language model training codebase', 'Grootschalige autoregressieve taalmodel-trainingscodebase', 'approved', 'curated', '2020-12-22', '2020-12-22T12:00:00Z'),
      ('curated-deepspeed', 'DeepSpeed', 'https://github.com/microsoft/DeepSpeed', 'github', 'models', 'Deep learning optimization library for training at scale', 'Deep-learning-optimalisatiebibliotheek voor training op schaal', 'approved', 'curated', '2020-01-23', '2020-01-23T12:00:00Z')
    ON CONFLICT ("repo_url") DO NOTHING;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."awesome_ai_oss_project"
    WHERE "id" IN (
      'curated-plandex', 'curated-dzhng-deep-research', 'curated-deer-flow',
      'curated-rag-anything', 'curated-kotaemon', 'curated-flagembedding',
      'curated-colbert', 'curated-vespa', 'curated-pathway',
      'curated-falkordb', 'curated-pgai', 'curated-supermemory',
      'curated-flowise', 'curated-chainlit', 'curated-cline',
      'curated-roo-code', 'curated-tabby', 'curated-copilotkit',
      'curated-assistant-ui', 'curated-void', 'curated-gpt4all',
      'curated-sillytavern', 'curated-skyvern', 'curated-stagehand',
      'curated-crawlee', 'curated-e2b', 'curated-composio',
      'curated-guardrails', 'curated-agentops', 'curated-trafilatura',
      'curated-microsoft-playwright-mcp', 'curated-daytona', 'curated-openlit',
      'curated-llm-guard', 'curated-llama-cpp', 'curated-whisper-cpp',
      'curated-mlc-llm', 'curated-tgi', 'curated-tensorrt-llm',
      'curated-sglang', 'curated-paddlenlp', 'curated-axolotl',
      'curated-unsloth', 'curated-peft', 'curated-trl',
      'curated-accelerate', 'curated-diffusers', 'curated-tokenizers',
      'curated-gpt-neox', 'curated-deepspeed'
    );
  `);
}
