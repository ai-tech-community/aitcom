// Additive chunk 6/6: 13 approved curated GitHub seeds for the live
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
      ('curated-kohya-ss', 'Kohya SS', 'https://github.com/bmaltais/kohya_ss', 'github', 'models', 'GUI for Stable Diffusion training and fine-tuning', 'GUI voor Stable Diffusion-training en fine-tuning', 'approved', 'curated', '2022-10-30', '2022-10-30T12:00:00Z'),
      ('curated-optimum', 'Optimum', 'https://github.com/huggingface/optimum', 'github', 'models', 'Acceleration library for Transformers on specialized hardware', 'Acceleratiebibliotheek voor Transformers op gespecialiseerde hardware', 'approved', 'curated', '2021-07-20', '2021-07-20T12:00:00Z'),
      ('curated-onnxruntime', 'ONNX Runtime', 'https://github.com/microsoft/onnxruntime', 'github', 'models', 'Cross-platform inference and training accelerator', 'Cross-platform inference- en trainingaccelerator', 'approved', 'curated', '2018-11-10', '2018-11-10T12:00:00Z'),
      ('curated-flash-attention', 'FlashAttention', 'https://github.com/Dao-AILab/flash-attention', 'github', 'models', 'Fast and memory-efficient exact attention', 'Snelle en geheugenefficiënte exacte attention', 'approved', 'curated', '2022-05-19', '2022-05-19T12:00:00Z'),
      ('curated-mamba', 'Mamba', 'https://github.com/state-spaces/mamba', 'github', 'models', 'Selective state space model architecture and code', 'Selectieve state-space-modelarchitectuur en -code', 'approved', 'curated', '2023-12-01', '2023-12-01T12:00:00Z'),
      ('curated-llm-c', 'llm.c', 'https://github.com/karpathy/llm.c', 'github', 'models', 'LLM training in pure C/CUDA', 'LLM-training in puur C/CUDA', 'approved', 'curated', '2024-04-08', '2024-04-08T12:00:00Z'),
      ('curated-tinygrad', 'tinygrad', 'https://github.com/tinygrad/tinygrad', 'github', 'models', 'Simple neural network framework aiming for ease of use', 'Eenvoudig neurale-netwerkframework gericht op gebruiksgemak', 'approved', 'curated', '2020-10-18', '2020-10-18T12:00:00Z'),
      ('curated-jax', 'JAX', 'https://github.com/jax-ml/jax', 'github', 'models', 'Composable transformations of Python+NumPy programs', 'Composeerbare transformaties van Python+NumPy-programma’s', 'approved', 'curated', '2018-10-25', '2018-10-25T12:00:00Z'),
      ('curated-flax', 'Flax', 'https://github.com/google/flax', 'github', 'models', 'Neural network library for JAX', 'Neurale-netwerkbibliotheek voor JAX', 'approved', 'curated', '2020-01-10', '2020-01-10T12:00:00Z'),
      ('curated-lerobot', 'LeRobot', 'https://github.com/huggingface/lerobot', 'github', 'models', 'PyTorch library for real-world robotics with ML', 'PyTorch-library voor echte robotica met ML', 'approved', 'curated', '2024-01-26', '2024-01-26T12:00:00Z'),
      ('curated-pythia', 'Pythia', 'https://github.com/EleutherAI/pythia', 'github', 'models', 'Suite of open interpretability-friendly LLMs', 'Suite van open, interpretatievriendelijke LLM’s', 'approved', 'curated', '2021-12-25', '2021-12-25T12:00:00Z'),
      ('curated-open-instruct', 'Open Instruct', 'https://github.com/allenai/open-instruct', 'github', 'models', 'Code and data for open instruction tuning', 'Code en data voor open instruction tuning', 'approved', 'curated', '2023-06-09', '2023-06-09T12:00:00Z'),
      ('curated-promptsource', 'PromptSource', 'https://github.com/bigscience-workshop/promptsource', 'github', 'models', 'Toolkit for creating prompting datasets', 'Toolkit voor het maken van prompting-datasets', 'approved', 'curated', '2021-05-19', '2021-05-19T12:00:00Z')
    ON CONFLICT ("repo_url") DO NOTHING;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."awesome_ai_oss_project"
    WHERE "id" IN (
      'curated-kohya-ss', 'curated-optimum', 'curated-onnxruntime',
      'curated-flash-attention', 'curated-mamba', 'curated-llm-c',
      'curated-tinygrad', 'curated-jax', 'curated-flax',
      'curated-lerobot', 'curated-pythia', 'curated-open-instruct',
      'curated-promptsource'
    );
  `);
}
