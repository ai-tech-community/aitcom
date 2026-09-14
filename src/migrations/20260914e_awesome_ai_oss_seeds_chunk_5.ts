// Additive chunk 5/6: 50 approved curated GitHub seeds for the live
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
      ('curated-litgpt', 'LitGPT', 'https://github.com/Lightning-AI/litgpt', 'github', 'models', 'Hackable GPT training and inference with Lightning', 'Hackbare GPT-training en -inference met Lightning', 'approved', 'curated', '2023-05-04', '2023-05-04T12:00:00Z'),
      ('curated-nanogpt', 'nanoGPT', 'https://github.com/karpathy/nanoGPT', 'github', 'models', 'Minimal reproducible GPT training codebase', 'Minimale reproduceerbare GPT-trainingscodebase', 'approved', 'curated', '2022-12-28', '2022-12-28T12:00:00Z'),
      ('curated-minicpm-o', 'MiniCPM-V', 'https://github.com/OpenBMB/MiniCPM-V', 'github', 'models', 'OpenBMB MiniCPM vision-language and omni model family', 'OpenBMB MiniCPM vision-language- en omni-modelfamilie', 'approved', 'curated', '2024-01-29', '2024-01-29T12:00:00Z'),
      ('curated-llama-cpp-python', 'llama-cpp-python', 'https://github.com/abetlen/llama-cpp-python', 'github', 'models', 'Python bindings for llama.cpp', 'Python-bindings voor llama.cpp', 'approved', 'curated', '2023-03-23', '2023-03-23T12:00:00Z'),
      ('curated-llamafile', 'llamafile', 'https://github.com/mozilla-ai/llamafile', 'github', 'models', 'Distribute and run LLMs as a single-file executable', 'Verspreid en draai LLM’s als één uitvoerbaar bestand', 'approved', 'curated', '2023-09-10', '2023-09-10T12:00:00Z'),
      ('curated-localai', 'LocalAI', 'https://github.com/mudler/LocalAI', 'github', 'models', 'Self-hosted OpenAI-compatible local AI REST API', 'Zelf-gehoste OpenAI-compatibele lokale AI-REST-API', 'approved', 'curated', '2023-03-18', '2023-03-18T12:00:00Z'),
      ('curated-text-generation-webui', 'text-generation-webui', 'https://github.com/oobabooga/textgen', 'github', 'models', 'Gradio web UI for running large language models', 'Gradio-web-UI voor het draaien van grote taalmodellen', 'approved', 'curated', '2022-12-21', '2022-12-21T12:00:00Z'),
      ('curated-koboldcpp', 'KoboldCpp', 'https://github.com/LostRuins/koboldcpp', 'github', 'models', 'llama.cpp-based AI inference with Kobold-style API', 'llama.cpp-gebaseerde AI-inference met Kobold-stijl-API', 'approved', 'curated', '2023-03-16', '2023-03-16T12:00:00Z'),
      ('curated-tabbyapi', 'tabbyAPI', 'https://github.com/theroyallab/tabbyAPI', 'github', 'models', 'OpenAI-compatible API server for local Exllama models', 'OpenAI-compatibele API-server voor lokale Exllama-modellen', 'approved', 'curated', '2023-11-10', '2023-11-10T12:00:00Z'),
      ('curated-exllamav2', 'ExLlamaV2', 'https://github.com/turboderp-org/exllamav2', 'github', 'models', 'Fast inference library for local LLMs on consumer GPUs', 'Snelle inference-library voor lokale LLM’s op consumenten-GPU’s', 'approved', 'curated', '2023-08-30', '2023-08-30T12:00:00Z'),
      ('curated-lm-evaluation-harness', 'lm-evaluation-harness', 'https://github.com/EleutherAI/lm-evaluation-harness', 'github', 'eval-observability', 'Standardized few-shot evaluation harness for language models', 'Gestandaardiseerde few-shot-evaluatieharness voor taalmodellen', 'approved', 'curated', '2020-08-28', '2020-08-28T12:00:00Z'),
      ('curated-opencompass', 'OpenCompass', 'https://github.com/open-compass/opencompass', 'github', 'eval-observability', 'LLM evaluation platform with many benchmarks', 'LLM-evaluatieplatform met veel benchmarks', 'approved', 'curated', '2023-06-15', '2023-06-15T12:00:00Z'),
      ('curated-helm', 'HELM', 'https://github.com/stanford-crfm/helm', 'github', 'eval-observability', 'Holistic Evaluation of Language Models from Stanford CRFM', 'Holistische evaluatie van taalmodellen van Stanford CRFM', 'approved', 'curated', '2021-11-29', '2021-11-29T12:00:00Z'),
      ('curated-inspect-ai', 'Inspect AI', 'https://github.com/UKGovernmentBEIS/inspect_ai', 'github', 'eval-observability', 'Framework for large language model evaluations', 'Framework voor evaluaties van grote taalmodellen', 'approved', 'curated', '2023-11-14', '2023-11-14T12:00:00Z'),
      ('curated-openai-evals', 'OpenAI Evals', 'https://github.com/openai/evals', 'github', 'eval-observability', 'Framework for evaluating LLMs and systems built with them', 'Framework voor het evalueren van LLM’s en systemen die ermee zijn gebouwd', 'approved', 'curated', '2023-01-23', '2023-01-23T12:00:00Z'),
      ('curated-olmo', 'OLMo', 'https://github.com/allenai/OLMo', 'github', 'models', 'Open language model and training stack from AI2', 'Open taalmodel en trainingsstack van AI2', 'approved', 'curated', '2023-02-20', '2023-02-20T12:00:00Z'),
      ('curated-dolma', 'DOLMA', 'https://github.com/allenai/dolma', 'github', 'models', 'Open dataset of 3T tokens for language model pretraining', 'Open dataset van 3T tokens voor taalmodel-pretraining', 'approved', 'curated', '2023-06-20', '2023-06-20T12:00:00Z'),
      ('curated-llama', 'Llama', 'https://github.com/meta-llama/llama', 'github', 'models', 'Meta Llama model weights and inference code (check access)', 'Meta Llama-modelgewichten en inference-code (controleer toegang)', 'approved', 'curated', '2023-02-14', '2023-02-14T12:00:00Z'),
      ('curated-gemma', 'Gemma', 'https://github.com/google-deepmind/gemma', 'github', 'models', 'Gemma open models from Google DeepMind', 'Gemma open modellen van Google DeepMind', 'approved', 'curated', '2024-02-20', '2024-02-20T12:00:00Z'),
      ('curated-mistral-inference', 'mistral-inference', 'https://github.com/mistralai/mistral-inference', 'github', 'models', 'Reference inference for Mistral open models', 'Referentie-inference voor Mistral open modellen', 'approved', 'curated', '2023-09-27', '2023-09-27T12:00:00Z'),
      ('curated-mistral-common', 'mistral-common', 'https://github.com/mistralai/mistral-common', 'github', 'models', 'Shared tokenization and tools for Mistral models', 'Gedeelde tokenisatie en tools voor Mistral-modellen', 'approved', 'curated', '2024-04-15', '2024-04-15T12:00:00Z'),
      ('curated-qwen25', 'Qwen3', 'https://github.com/QwenLM/Qwen3', 'github', 'models', 'Qwen3 open LLM family from Alibaba', 'Qwen3 open LLM-familie van Alibaba', 'approved', 'curated', '2024-02-05', '2024-02-05T12:00:00Z'),
      ('curated-qwen', 'Qwen', 'https://github.com/QwenLM/Qwen', 'github', 'models', 'Qwen large language model series', 'Qwen grote-taalmodelserie', 'approved', 'curated', '2023-08-03', '2023-08-03T12:00:00Z'),
      ('curated-chatglm3', 'ChatGLM3', 'https://github.com/zai-org/ChatGLM3', 'github', 'models', 'Open bilingual chat model series from THUDM', 'Open tweetalige chatmodelserie van THUDM', 'approved', 'curated', '2023-10-26', '2023-10-26T12:00:00Z'),
      ('curated-internlm', 'InternLM', 'https://github.com/InternLM/InternLM', 'github', 'models', 'InternLM open bilingual foundation models', 'InternLM open tweetalige foundation-modellen', 'approved', 'curated', '2023-07-06', '2023-07-06T12:00:00Z'),
      ('curated-yi', 'Yi', 'https://github.com/01-ai/Yi', 'github', 'models', 'Yi open bilingual large language models', 'Yi open tweetalige grote taalmodellen', 'approved', 'curated', '2023-11-03', '2023-11-03T12:00:00Z'),
      ('curated-llm-foundry', 'LLM Foundry', 'https://github.com/mosaicml/llm-foundry', 'github', 'models', 'Training and fine-tuning code for LLMs with Composer', 'Trainings- en fine-tuningcode voor LLM’s met Composer', 'approved', 'curated', '2023-04-28', '2023-04-28T12:00:00Z'),
      ('curated-dolly', 'Dolly', 'https://github.com/databrickslabs/dolly', 'github', 'models', 'Databricks instruction-following LLM and dataset', 'Databricks instruction-following LLM en dataset', 'approved', 'curated', '2023-03-24', '2023-03-24T12:00:00Z'),
      ('curated-fastchat', 'FastChat', 'https://github.com/lm-sys/FastChat', 'github', 'models', 'Training serving and evaluation platform for chatbots', 'Trainings-, serving- en evaluatieplatform voor chatbots', 'approved', 'curated', '2023-03-19', '2023-03-19T12:00:00Z'),
      ('curated-web-llm', 'WebLLM', 'https://github.com/mlc-ai/web-llm', 'github', 'models', 'In-browser LLM inference via WebGPU', 'In-browser LLM-inference via WebGPU', 'approved', 'curated', '2023-04-13', '2023-04-13T12:00:00Z'),
      ('curated-mlx', 'MLX', 'https://github.com/ml-explore/mlx', 'github', 'models', 'Array framework for machine learning on Apple silicon', 'Array-framework voor machine learning op Apple silicon', 'approved', 'curated', '2023-11-28', '2023-11-28T12:00:00Z'),
      ('curated-mlx-examples', 'MLX Examples', 'https://github.com/ml-explore/mlx-examples', 'github', 'models', 'Example models and apps built with MLX', 'Voorbeeldmodellen en apps gebouwd met MLX', 'approved', 'curated', '2023-11-28', '2023-11-28T12:00:00Z'),
      ('curated-candle', 'Candle', 'https://github.com/huggingface/candle', 'github', 'models', 'Minimalist ML framework for Rust', 'Minimalistisch ML-framework voor Rust', 'approved', 'curated', '2023-06-19', '2023-06-19T12:00:00Z'),
      ('curated-torchtune', 'torchtune', 'https://github.com/meta-pytorch/torchtune', 'github', 'models', 'PyTorch-native library for LLM fine-tuning', 'PyTorch-native library voor LLM-fine-tuning', 'approved', 'curated', '2023-10-20', '2023-10-20T12:00:00Z'),
      ('curated-torchtitan', 'TorchTitan', 'https://github.com/pytorch/torchtitan', 'github', 'models', 'PyTorch native large-scale LLM training framework', 'PyTorch-native grootschalig LLM-trainingsframework', 'approved', 'curated', '2023-12-13', '2023-12-13T12:00:00Z'),
      ('curated-nemo', 'NeMo', 'https://github.com/NVIDIA-NeMo/Speech', 'github', 'models', 'NVIDIA toolkit for conversational AI and LLM training', 'NVIDIA-toolkit voor conversationele AI en LLM-training', 'approved', 'curated', '2019-08-05', '2019-08-05T12:00:00Z'),
      ('curated-openvino', 'OpenVINO', 'https://github.com/openvinotoolkit/openvino', 'github', 'models', 'Toolkit for optimizing and deploying AI inference', 'Toolkit voor het optimaliseren en deployen van AI-inference', 'approved', 'curated', '2018-10-15', '2018-10-15T12:00:00Z'),
      ('curated-intel-extension-for-transformers', 'Intel Extension for Transformers', 'https://github.com/intel/intel-extension-for-transformers', 'github', 'models', 'Optimized Transformers inference and fine-tuning on Intel', 'Geoptimaliseerde Transformers-inference en fine-tuning op Intel', 'approved', 'curated', '2022-11-11', '2022-11-11T12:00:00Z'),
      ('curated-starcoder2', 'StarCoder2', 'https://github.com/bigcode-project/starcoder2', 'github', 'models', 'Open code LLM family from BigCode', 'Open code-LLM-familie van BigCode', 'approved', 'curated', '2023-12-08', '2023-12-08T12:00:00Z'),
      ('curated-codegen', 'CodeGen', 'https://github.com/salesforce/CodeGen', 'github', 'models', 'Open code generation models from Salesforce', 'Open codegeneratiemodellen van Salesforce', 'approved', 'curated', '2022-03-28', '2022-03-28T12:00:00Z'),
      ('curated-stablelm', 'StableLM', 'https://github.com/Stability-AI/StableLM', 'github', 'models', 'Stability AI language model family', 'Stability AI-taalmodelfamilie', 'approved', 'curated', '2023-04-19', '2023-04-19T12:00:00Z'),
      ('curated-redpajama-data', 'RedPajama-Data', 'https://github.com/togethercomputer/RedPajama-Data', 'github', 'models', 'Open dataset reproducing LLaMA training data recipe', 'Open dataset die het LLaMA-trainingsdatarecept reproduceert', 'approved', 'curated', '2023-04-14', '2023-04-14T12:00:00Z'),
      ('curated-internvl', 'InternVL', 'https://github.com/OpenGVLab/InternVL', 'github', 'models', 'Open multimodal vision-language models', 'Open multimodale vision-language-modellen', 'approved', 'curated', '2023-11-22', '2023-11-22T12:00:00Z'),
      ('curated-llava', 'LLaVA', 'https://github.com/haotian-liu/LLaVA', 'github', 'models', 'Large Language and Vision Assistant multimodal models', 'Large Language and Vision Assistant multimodale modellen', 'approved', 'curated', '2023-04-17', '2023-04-17T12:00:00Z'),
      ('curated-whisper', 'Whisper', 'https://github.com/openai/whisper', 'github', 'models', 'Robust speech recognition models from OpenAI', 'Robuuste spraakherkenningsmodellen van OpenAI', 'approved', 'curated', '2022-09-16', '2022-09-16T12:00:00Z'),
      ('curated-coqui-tts', 'Coqui TTS', 'https://github.com/coqui-ai/TTS', 'github', 'models', 'Deep learning toolkit for Text-to-Speech', 'Deep-learning-toolkit voor Text-to-Speech', 'approved', 'curated', '2020-05-20', '2020-05-20T12:00:00Z'),
      ('curated-rvc', 'RVC', 'https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI', 'github', 'models', 'Voice conversion toolkit with a WebUI', 'Voice-conversion-toolkit met een WebUI', 'approved', 'curated', '2023-03-27', '2023-03-27T12:00:00Z'),
      ('curated-stable-diffusion-webui', 'Stable Diffusion WebUI', 'https://github.com/AUTOMATIC1111/stable-diffusion-webui', 'github', 'models', 'Popular WebUI for Stable Diffusion image generation', 'Populaire WebUI voor Stable Diffusion-beeldgeneratie', 'approved', 'curated', '2022-08-22', '2022-08-22T12:00:00Z'),
      ('curated-comfyui', 'ComfyUI', 'https://github.com/Comfy-Org/ComfyUI', 'github', 'models', 'Node-based UI for diffusion and generative workflows', 'Node-gebaseerde UI voor diffusion- en generatieve workflows', 'approved', 'curated', '2023-01-17', '2023-01-17T12:00:00Z'),
      ('curated-invokeai', 'InvokeAI', 'https://github.com/invoke-ai/InvokeAI', 'github', 'models', 'Creative engine for Stable Diffusion workflows', 'Creatieve engine voor Stable Diffusion-workflows', 'approved', 'curated', '2022-08-17', '2022-08-17T12:00:00Z')
    ON CONFLICT ("repo_url") DO NOTHING;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."awesome_ai_oss_project"
    WHERE "id" IN (
      'curated-litgpt', 'curated-nanogpt', 'curated-minicpm-o',
      'curated-llama-cpp-python', 'curated-llamafile', 'curated-localai',
      'curated-text-generation-webui', 'curated-koboldcpp', 'curated-tabbyapi',
      'curated-exllamav2', 'curated-lm-evaluation-harness', 'curated-opencompass',
      'curated-helm', 'curated-inspect-ai', 'curated-openai-evals',
      'curated-olmo', 'curated-dolma', 'curated-llama',
      'curated-gemma', 'curated-mistral-inference', 'curated-mistral-common',
      'curated-qwen25', 'curated-qwen', 'curated-chatglm3',
      'curated-internlm', 'curated-yi', 'curated-llm-foundry',
      'curated-dolly', 'curated-fastchat', 'curated-web-llm',
      'curated-mlx', 'curated-mlx-examples', 'curated-candle',
      'curated-torchtune', 'curated-torchtitan', 'curated-nemo',
      'curated-openvino', 'curated-intel-extension-for-transformers', 'curated-starcoder2',
      'curated-codegen', 'curated-stablelm', 'curated-redpajama-data',
      'curated-internvl', 'curated-llava', 'curated-whisper',
      'curated-coqui-tts', 'curated-rvc', 'curated-stable-diffusion-webui',
      'curated-comfyui', 'curated-invokeai'
    );
  `);
}
