-- Custom SQL migration file, put your code below! --

CREATE TABLE IF NOT EXISTS "app"."launchpad_update" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"author_id" varchar(255) NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "app"."launchpad_comment" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"author_id" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"parent_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "app"."launchpad_vote" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"voter_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Foreign keys
ALTER TABLE "app"."launchpad_update" ADD CONSTRAINT "launchpad_update_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "app"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "app"."launchpad_comment" ADD CONSTRAINT "launchpad_comment_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "app"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "app"."launchpad_vote" ADD CONSTRAINT "launchpad_vote_voter_id_app_user_id_fk" FOREIGN KEY ("voter_id") REFERENCES "app"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Indexes
CREATE INDEX IF NOT EXISTS "launchpad_update_project_idx" ON "app"."launchpad_update" USING btree ("project_id");
CREATE INDEX IF NOT EXISTS "launchpad_update_author_idx" ON "app"."launchpad_update" USING btree ("author_id");
CREATE INDEX IF NOT EXISTS "launchpad_comment_project_idx" ON "app"."launchpad_comment" USING btree ("project_id");
CREATE INDEX IF NOT EXISTS "launchpad_comment_author_idx" ON "app"."launchpad_comment" USING btree ("author_id");
CREATE INDEX IF NOT EXISTS "launchpad_comment_parent_idx" ON "app"."launchpad_comment" USING btree ("parent_id");
CREATE UNIQUE INDEX IF NOT EXISTS "launchpad_vote_project_voter_idx" ON "app"."launchpad_vote" USING btree ("project_id", "voter_id");
