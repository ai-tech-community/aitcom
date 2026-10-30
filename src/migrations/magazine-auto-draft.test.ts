// @vitest-environment node
import { PgDialect } from "@payloadcms/db-postgres/drizzle/pg-core";
import { describe, expect, it } from "vitest";

import {
  AUTO_DRAFT_CADENCES,
  AUTO_DRAFT_LOOK_BACKS,
  AUTO_DRAFT_WHEN_READY,
} from "@/lib/magazines/auto-draft";
import {
  AUTO_DRAFT_RUN_STATUSES,
  AUTO_DRAFT_SKIP_REASONS,
  AUTO_DRAFT_TRIGGERS,
  ISSUE_HISTORY_ACTOR_KINDS,
  ISSUE_HISTORY_EVENTS,
} from "@/lib/magazines/issue-history";
import {
  ISSUE_LAYOUTS,
  ISSUE_VISIBILITIES,
  PUBLISH_ORIGINS,
} from "@/lib/magazines/values";

import { up as originalUp } from "./20261027c_magazine_auto_draft";
import { up as followupUp } from "./20261027d_magazine_auto_draft_followups";
import { up as growthUp } from "./20261028a_magazine_growth";

const checks = [
  ["magazine_auto_draft_settings_cadence_check", AUTO_DRAFT_CADENCES],
  ["magazine_auto_draft_settings_look_back_check", AUTO_DRAFT_LOOK_BACKS],
  ["magazine_auto_draft_settings_layout_check", ISSUE_LAYOUTS],
  ["magazine_auto_draft_settings_visibility_check", ISSUE_VISIBILITIES],
  ["magazine_auto_draft_settings_when_ready_check", AUTO_DRAFT_WHEN_READY],
  ["magazine_auto_draft_run_skip_reason_check", AUTO_DRAFT_SKIP_REASONS],
  ["magazine_auto_draft_run_trigger_check", AUTO_DRAFT_TRIGGERS],
  ["magazine_auto_draft_run_status_check", AUTO_DRAFT_RUN_STATUSES],
  ["magazine_issue_history_event_check", ISSUE_HISTORY_EVENTS],
  ["magazine_issue_history_origin_check", PUBLISH_ORIGINS],
  ["magazine_issue_history_actor_kind_check", ISSUE_HISTORY_ACTOR_KINDS],
] as const;

describe("automatic draft migration value lists", () => {
  it.each(checks)(
    "keeps %s equal to the shared constants",
    async (name, values) => {
      const statements: string[] = [];
      const db = {
        execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
          statements.push(new PgDialect().sqlToQuery(query).sql);
        },
      };
      await originalUp({ db } as never);
      await followupUp({ db } as never);
      await growthUp({ db } as never);
      // Later migrations may widen a check; compare its final definition.
      const constraints = [
        ...statements
          .join("\n")
          .matchAll(
            new RegExp(`CONSTRAINT "${name}"\\s+CHECK \\(([^;]+?)\\)\\)`, "g"),
          ),
      ];
      const constraint = constraints.at(-1);
      expect(constraint, `missing ${name}`).toBeDefined();
      const listed = [...constraint![1]!.matchAll(/'([^']+)'/g)].map(
        (match) => match[1],
      );
      expect(listed).toEqual([...values]);
    },
  );
});
