// Full-text search for the public jobs list.
//
// `search_vector` holds a role's title, company name, location, work type and
// description, GIN-indexed. The company name lives on `startup`, so a
// generated column cannot reach it; two triggers keep the vector current
// instead, whichever code path writes the row:
//   - a role insert or text edit rebuilds that role's vector;
//   - a company rename rebuilds the vectors of its roles.
// With the company name in the stored vector, a search that spans company
// and role ("stripe engineer") is one indexed `@@` lookup.
//
// Each text is indexed twice: with the `english` config (stems, so
// "engineers" finds "engineer") and with `simple` (words as written, so a
// half-typed "enginee" still prefix-matches "engineering"; the stem "engin"
// would not). Weights (A title, B company, C location and work type,
// D description) leave room for relevance ranking later.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup_role"
      ADD COLUMN IF NOT EXISTS "search_vector" tsvector;
  `);
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION "app"."startup_role_search_vector"(
      title text,
      company text,
      location text,
      work_type text,
      description text
    ) RETURNS tsvector
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
      SELECT
        setweight(
          to_tsvector('english', coalesce(title, '')) ||
            to_tsvector('simple', coalesce(title, '')),
          'A'
        ) ||
        setweight(
          to_tsvector('english', coalesce(company, '')) ||
            to_tsvector('simple', coalesce(company, '')),
          'B'
        ) ||
        setweight(
          to_tsvector(
            'english',
            coalesce(location, '') || ' ' || coalesce(work_type, '')
          ) ||
            to_tsvector(
              'simple',
              coalesce(location, '') || ' ' || coalesce(work_type, '')
            ),
          'C'
        ) ||
        setweight(
          to_tsvector('english', coalesce(description, '')) ||
            to_tsvector('simple', coalesce(description, '')),
          'D'
        )
    $$;
  `);
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION "app"."startup_role_search_vector_refresh"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW."search_vector" := "app"."startup_role_search_vector"(
        NEW."title",
        (SELECT "name" FROM "app"."startup" WHERE "id" = NEW."startup_id"),
        NEW."location",
        NEW."work_type",
        NEW."description_text"
      );
      RETURN NEW;
    END;
    $$;
  `);
  await db.execute(sql`
    DROP TRIGGER IF EXISTS "startup_role_search_vector_refresh"
      ON "app"."startup_role";
    CREATE TRIGGER "startup_role_search_vector_refresh"
      BEFORE INSERT OR UPDATE OF
        "title", "location", "work_type", "description_text", "startup_id"
      ON "app"."startup_role"
      FOR EACH ROW
      EXECUTE FUNCTION "app"."startup_role_search_vector_refresh"();
  `);
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION "app"."startup_name_search_vector_refresh"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      UPDATE "app"."startup_role"
        SET "search_vector" = "app"."startup_role_search_vector"(
          "title",
          NEW."name",
          "location",
          "work_type",
          "description_text"
        )
        WHERE "startup_id" = NEW."id";
      RETURN NULL;
    END;
    $$;
  `);
  await db.execute(sql`
    DROP TRIGGER IF EXISTS "startup_name_search_vector_refresh"
      ON "app"."startup";
    CREATE TRIGGER "startup_name_search_vector_refresh"
      AFTER UPDATE OF "name" ON "app"."startup"
      FOR EACH ROW
      WHEN (OLD."name" IS DISTINCT FROM NEW."name")
      EXECUTE FUNCTION "app"."startup_name_search_vector_refresh"();
  `);
  await db.execute(sql`
    UPDATE "app"."startup_role" AS r
      SET "search_vector" = "app"."startup_role_search_vector"(
        r."title",
        s."name",
        r."location",
        r."work_type",
        r."description_text"
      )
      FROM "app"."startup" AS s
      WHERE s."id" = r."startup_id";
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "startup_role_search_idx"
      ON "app"."startup_role" USING gin ("search_vector");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS "startup_name_search_vector_refresh"
      ON "app"."startup";
    DROP TRIGGER IF EXISTS "startup_role_search_vector_refresh"
      ON "app"."startup_role";
    DROP FUNCTION IF EXISTS "app"."startup_name_search_vector_refresh"();
    DROP FUNCTION IF EXISTS "app"."startup_role_search_vector_refresh"();
    DROP FUNCTION IF EXISTS
      "app"."startup_role_search_vector"(text, text, text, text, text);
    DROP INDEX IF EXISTS "app"."startup_role_search_idx";
    ALTER TABLE "app"."startup_role" DROP COLUMN IF EXISTS "search_vector";
  `);
}
