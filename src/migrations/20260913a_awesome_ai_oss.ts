// Creates app.awesome_ai_oss_project / vote / save and seeds the 15 curated
// v1 repos as approved listed cards. DDL mirrors src/server/db/schema.ts.
// Fully idempotent so `payload migrate` is a safe no-op when the tables exist.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."awesome_ai_oss_project" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "repo_url" text NOT NULL,
      "repo_host" varchar(16) NOT NULL,
      "category" varchar(32) NOT NULL,
      "blurb_en" text NOT NULL,
      "blurb_nl" text NOT NULL,
      "status" varchar(16) NOT NULL DEFAULT 'pending',
      "source" varchar(16) NOT NULL DEFAULT 'member',
      "added_on" date,
      "reviewer_note" text,
      "rejection_reason" text,
      "submitted_by_user_id" varchar(255) REFERENCES "app"."user"("id"),
      "reviewed_by_user_id" varchar(255) REFERENCES "app"."user"("id"),
      "reviewed_at" timestamptz,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updated_at" timestamptz
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "awesome_ai_oss_project_repo_url_idx"
      ON "app"."awesome_ai_oss_project" ("repo_url");
    CREATE INDEX IF NOT EXISTS "awesome_ai_oss_project_status_idx"
      ON "app"."awesome_ai_oss_project" ("status");
    CREATE INDEX IF NOT EXISTS "awesome_ai_oss_project_category_idx"
      ON "app"."awesome_ai_oss_project" ("category");
    CREATE INDEX IF NOT EXISTS "awesome_ai_oss_project_added_on_idx"
      ON "app"."awesome_ai_oss_project" ("added_on");

    CREATE TABLE IF NOT EXISTS "app"."awesome_ai_oss_vote" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "project_id" varchar(255) NOT NULL REFERENCES "app"."awesome_ai_oss_project"("id") ON DELETE CASCADE,
      "voter_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "awesome_ai_oss_vote_project_voter_idx"
      ON "app"."awesome_ai_oss_vote" ("project_id", "voter_id");
    CREATE INDEX IF NOT EXISTS "awesome_ai_oss_vote_project_idx"
      ON "app"."awesome_ai_oss_vote" ("project_id");

    CREATE TABLE IF NOT EXISTS "app"."awesome_ai_oss_save" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "project_id" varchar(255) NOT NULL REFERENCES "app"."awesome_ai_oss_project"("id") ON DELETE CASCADE,
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "awesome_ai_oss_save_project_user_idx"
      ON "app"."awesome_ai_oss_save" ("project_id", "user_id");
  `);

  await db.execute(sql`
    INSERT INTO "app"."awesome_ai_oss_project" (
      "id", "name", "repo_url", "repo_host", "category",
      "blurb_en", "blurb_nl", "status", "source", "added_on", "created_at"
    ) VALUES
      ('curated-mcp-servers', 'modelcontextprotocol/servers', 'https://github.com/modelcontextprotocol/servers', 'github', 'protocols', 'Reference MCP servers', 'Referentie-MCP-servers', 'approved', 'curated', '2024-11-25', '2024-11-25T12:00:00Z'),
      ('curated-mcp-python-sdk', 'modelcontextprotocol/python-sdk', 'https://github.com/modelcontextprotocol/python-sdk', 'github', 'protocols', 'Official Python SDK', 'Officiële Python-SDK', 'approved', 'curated', '2024-11-19', '2024-11-19T12:00:00Z'),
      ('curated-mcp-typescript-sdk', 'modelcontextprotocol/typescript-sdk', 'https://github.com/modelcontextprotocol/typescript-sdk', 'github', 'protocols', 'Official TS SDK', 'Officiële TS-SDK', 'approved', 'curated', '2024-11-19', '2024-11-19T12:00:00Z'),
      ('curated-fastmcp', 'PrefectHQ/fastmcp', 'https://github.com/PrefectHQ/fastmcp', 'github', 'runtimes', 'FastMCP server/client framework', 'FastMCP server/client-framework', 'approved', 'curated', '2024-04-08', '2024-04-08T12:00:00Z'),
      ('curated-mcp-agent', 'lastmile-ai/mcp-agent', 'https://github.com/lastmile-ai/mcp-agent', 'github', 'runtimes', 'MCP-native agent patterns', 'MCP-native agentpatronen', 'approved', 'curated', '2024-12-10', '2024-12-10T12:00:00Z'),
      ('curated-lazy-mcp', 'gitlab-org/ai/lazy-mcp', 'https://gitlab.com/gitlab-org/ai/lazy-mcp', 'gitlab', 'runtimes', 'GitLab Lazy MCP', 'GitLab Lazy MCP', 'approved', 'curated', '2025-03-15', '2025-03-15T12:00:00Z'),
      ('curated-openai-agents', 'openai/openai-agents-python', 'https://github.com/openai/openai-agents-python', 'github', 'frameworks', 'OpenAI Agents SDK (+ MCP)', 'OpenAI Agents SDK (+ MCP)', 'approved', 'curated', '2025-03-11', '2025-03-11T12:00:00Z'),
      ('curated-ms-agent-framework', 'microsoft/agent-framework', 'https://github.com/microsoft/agent-framework', 'github', 'frameworks', 'Multi-agent workflows', 'Multi-agent-workflows', 'approved', 'curated', '2025-10-01', '2025-10-01T12:00:00Z'),
      ('curated-langgraph', 'langchain-ai/langgraph', 'https://github.com/langchain-ai/langgraph', 'github', 'frameworks', 'Stateful agent graphs', 'Stateful agent-graphs', 'approved', 'curated', '2024-01-17', '2024-01-17T12:00:00Z'),
      ('curated-transformers', 'huggingface/transformers', 'https://github.com/huggingface/transformers', 'github', 'models', 'Models & tooling', 'Modellen en tooling', 'approved', 'curated', '2018-11-08', '2018-11-08T12:00:00Z'),
      ('curated-vllm', 'vllm-project/vllm', 'https://github.com/vllm-project/vllm', 'github', 'models', 'Open model serving', 'Open-model-serving', 'approved', 'curated', '2023-06-20', '2023-06-20T12:00:00Z'),
      ('curated-ollama', 'ollama/ollama', 'https://github.com/ollama/ollama', 'github', 'models', 'Local model run', 'Lokaal model draaien', 'approved', 'curated', '2023-07-01', '2023-07-01T12:00:00Z'),
      ('curated-a2a', 'google/A2A', 'https://github.com/google/A2A', 'github', 'models', 'Agent-to-agent protocol', 'Agent-to-agent-protocol', 'approved', 'curated', '2025-04-09', '2025-04-09T12:00:00Z'),
      ('curated-gitlab-ai-assist', 'gitlab-org/modelops/applied-ml/code-suggestions/ai-assist', 'https://gitlab.com/gitlab-org/modelops/applied-ml/code-suggestions/ai-assist', 'gitlab', 'other', 'GitLab AI Gateway for Duo / AI features', 'GitLab AI Gateway voor Duo / AI-features', 'approved', 'curated', '2023-05-01', '2023-05-01T12:00:00Z'),
      ('curated-gitlab', 'gitlab-org/gitlab', 'https://gitlab.com/gitlab-org/gitlab', 'gitlab', 'other', 'GitLab application', 'GitLab-applicatie', 'approved', 'curated', '2014-10-08', '2014-10-08T12:00:00Z')
    ON CONFLICT ("repo_url") DO NOTHING;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."awesome_ai_oss_save";
    DROP TABLE IF EXISTS "app"."awesome_ai_oss_vote";
    DROP TABLE IF EXISTS "app"."awesome_ai_oss_project";
  `);
}
