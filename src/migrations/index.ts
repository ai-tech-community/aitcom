import * as migration_20260223_tags_array from "./20260223_tags_array";
import * as migration_20260225_135039_add_colab_url from "./20260225_135039_add_colab_url";
import * as migration_20260227_community_rules_sections from "./20260227_community_rules_sections";
import * as migration_20260227_forum_schema_upgrade from "./20260227_forum_schema_upgrade";
import * as migration_20260312_benchmark_tables from "./20260312_benchmark_tables";
import * as migration_20260312_benchmark_model_id from "./20260312_benchmark_model_id";
import * as migration_20260320_backfill_member_profiles from "./20260320_backfill_member_profiles";
import * as migration_20260326_community_feed_schema from "./20260326_community_feed_schema";
import * as migration_20260419_events_discovery_metadata from "./20260419_events_discovery_metadata";
import * as migration_20260419_143000_events_geocoding from "./20260419_143000_events_geocoding";
import * as migration_20260420_events_summary_audience_backfill from "./20260420_events_summary_audience_backfill";
import * as migration_20260420_brand_benchmark from "./20260420_brand_benchmark";
import * as migration_20260421_benchmark_hero_aggregate from "./20260421_benchmark_hero_aggregate";
import * as migration_20260421_benchmark_prompt_inferred_categories from "./20260421_benchmark_prompt_inferred_categories";
import * as migration_20260422_benchmark_citations_and_brand_aggs from "./20260422_benchmark_citations_and_brand_aggs";
import * as migration_20260422_prompt_tags from "./20260422_prompt_tags";
import * as migration_20260422_brand_watch from "./20260422_brand_watch";
import * as migration_20260427_datacenter_research from "./20260427_datacenter_research";
import * as migration_20260427_datacenter_finding_votes from "./20260427_datacenter_finding_votes";
import * as migration_20260428_brand_commitments from "./20260428_brand_commitments";
import * as migration_20260428_ownership_subsidies_permits from "./20260428_ownership_subsidies_permits";
import * as migration_20260428_brand_commitment_notes from "./20260428_brand_commitment_notes";
import * as migration_20260505_benchmark_assignments from "./20260505_benchmark_assignments";
import * as migration_20260509_investigation_edit_log from "./20260509_investigation_edit_log";
import * as migration_20260518_benchmark_surface_and_proxy from "./20260518_benchmark_surface_and_proxy";
import * as migration_20260518_agg_brand_visibility_by_surface from "./20260518_agg_brand_visibility_by_surface";
import * as migration_20260518_benchmark_run_nullable_submitter from "./20260518_benchmark_run_nullable_submitter";
import * as migration_20260518b_benchmark_run_nullable_model_id from "./20260518b_benchmark_run_nullable_model_id";
import * as migration_20260518c_benchmark_coverage_by_cell from "./20260518c_benchmark_coverage_by_cell";
import * as migration_20260518d_benchmark_assignment_byoa from "./20260518d_benchmark_assignment_byoa";
import * as migration_20260528_event_submission from "./20260528_event_submission";
import * as migration_20260530_backfill_membership_community_id from "./20260530_backfill_membership_community_id";
import * as migration_20260530b_activity_event_community_action_created_idx from "./20260530b_activity_event_community_action_created_idx";
import * as migration_20260530c_notifications_infra from "./20260530c_notifications_infra";
import * as migration_20260531_notifications_harden_unique_indexes from "./20260531_notifications_harden_unique_indexes";
import * as migration_20260531b_community_autonomy_level from "./20260531b_community_autonomy_level";
import * as migration_20260531c_agent_introductions from "./20260531c_agent_introductions";
import * as migration_20260531d_engage_rituals from "./20260531d_engage_rituals";
import * as migration_20260531e_activation from "./20260531e_activation";
import * as migration_20260531f_acquire from "./20260531f_acquire";
import * as migration_20260601a_agent_manifest_acceptance from "./20260601a_agent_manifest_acceptance";
import * as migration_20260601b_invite_role_target_email from "./20260601b_invite_role_target_email";
import * as migration_20260604a_work_grid_commission from "./20260604a_work_grid_commission";
import * as migration_20260608a_feed_topics_pins_links from "./20260608a_feed_topics_pins_links";
import * as migration_20260608b_classrooms from "./20260608b_classrooms";
import * as migration_20260608c_course_cover from "./20260608c_course_cover";
import * as migration_20260608d_locked_docs_rels from "./20260608d_locked_docs_rels";
import * as migration_20260608e_lesson_exams from "./20260608e_lesson_exams";
import * as migration_20260608f_topic_slug_not_null from "./20260608f_topic_slug_not_null";
import * as migration_20260609a_hackathon_teams from "./20260609a_hackathon_teams";
import * as migration_20260609b_team_judging from "./20260609b_team_judging";
import * as migration_20260609c_events_challenge_binding from "./20260609c_events_challenge_binding";

export const migrations = [
  {
    up: migration_20260223_tags_array.up,
    down: migration_20260223_tags_array.down,
    name: "20260223_tags_array",
  },
  {
    up: migration_20260225_135039_add_colab_url.up,
    down: migration_20260225_135039_add_colab_url.down,
    name: "20260225_135039_add_colab_url",
  },
  {
    up: migration_20260227_community_rules_sections.up,
    down: migration_20260227_community_rules_sections.down,
    name: "20260227_community_rules_sections",
  },
  {
    up: migration_20260227_forum_schema_upgrade.up,
    down: migration_20260227_forum_schema_upgrade.down,
    name: "20260227_forum_schema_upgrade",
  },
  {
    up: migration_20260312_benchmark_tables.up,
    down: migration_20260312_benchmark_tables.down,
    name: "20260312_benchmark_tables",
  },
  {
    up: migration_20260312_benchmark_model_id.up,
    down: migration_20260312_benchmark_model_id.down,
    name: "20260312_benchmark_model_id",
  },
  {
    up: migration_20260320_backfill_member_profiles.up,
    down: migration_20260320_backfill_member_profiles.down,
    name: "20260320_backfill_member_profiles",
  },
  {
    up: migration_20260326_community_feed_schema.up,
    down: migration_20260326_community_feed_schema.down,
    name: "20260326_community_feed_schema",
  },
  {
    up: migration_20260419_events_discovery_metadata.up,
    down: migration_20260419_events_discovery_metadata.down,
    name: "20260419_events_discovery_metadata",
  },
  {
    up: migration_20260419_143000_events_geocoding.up,
    down: migration_20260419_143000_events_geocoding.down,
    name: "20260419_143000_events_geocoding",
  },
  {
    up: migration_20260420_events_summary_audience_backfill.up,
    down: migration_20260420_events_summary_audience_backfill.down,
    name: "20260420_events_summary_audience_backfill",
  },
  {
    up: migration_20260420_brand_benchmark.up,
    down: migration_20260420_brand_benchmark.down,
    name: "20260420_brand_benchmark",
  },
  {
    up: migration_20260421_benchmark_hero_aggregate.up,
    down: migration_20260421_benchmark_hero_aggregate.down,
    name: "20260421_benchmark_hero_aggregate",
  },
  {
    up: migration_20260421_benchmark_prompt_inferred_categories.up,
    down: migration_20260421_benchmark_prompt_inferred_categories.down,
    name: "20260421_benchmark_prompt_inferred_categories",
  },
  {
    up: migration_20260422_benchmark_citations_and_brand_aggs.up,
    down: migration_20260422_benchmark_citations_and_brand_aggs.down,
    name: "20260422_benchmark_citations_and_brand_aggs",
  },
  {
    up: migration_20260422_prompt_tags.up,
    down: migration_20260422_prompt_tags.down,
    name: "20260422_prompt_tags",
  },
  {
    up: migration_20260422_brand_watch.up,
    down: migration_20260422_brand_watch.down,
    name: "20260422_brand_watch",
  },
  {
    up: migration_20260427_datacenter_research.up,
    down: migration_20260427_datacenter_research.down,
    name: "20260427_datacenter_research",
  },
  {
    up: migration_20260427_datacenter_finding_votes.up,
    down: migration_20260427_datacenter_finding_votes.down,
    name: "20260427_datacenter_finding_votes",
  },
  {
    up: migration_20260428_brand_commitments.up,
    down: migration_20260428_brand_commitments.down,
    name: "20260428_brand_commitments",
  },
  {
    up: migration_20260428_ownership_subsidies_permits.up,
    down: migration_20260428_ownership_subsidies_permits.down,
    name: "20260428_ownership_subsidies_permits",
  },
  {
    up: migration_20260428_brand_commitment_notes.up,
    down: migration_20260428_brand_commitment_notes.down,
    name: "20260428_brand_commitment_notes",
  },
  {
    up: migration_20260505_benchmark_assignments.up,
    down: migration_20260505_benchmark_assignments.down,
    name: "20260505_benchmark_assignments",
  },
  {
    up: migration_20260509_investigation_edit_log.up,
    down: migration_20260509_investigation_edit_log.down,
    name: "20260509_investigation_edit_log",
  },
  {
    up: migration_20260518_benchmark_surface_and_proxy.up,
    down: migration_20260518_benchmark_surface_and_proxy.down,
    name: "20260518_benchmark_surface_and_proxy",
  },
  {
    up: migration_20260518_agg_brand_visibility_by_surface.up,
    down: migration_20260518_agg_brand_visibility_by_surface.down,
    name: "20260518_agg_brand_visibility_by_surface",
  },
  {
    up: migration_20260518_benchmark_run_nullable_submitter.up,
    down: migration_20260518_benchmark_run_nullable_submitter.down,
    name: "20260518_benchmark_run_nullable_submitter",
  },
  {
    up: migration_20260518b_benchmark_run_nullable_model_id.up,
    down: migration_20260518b_benchmark_run_nullable_model_id.down,
    name: "20260518b_benchmark_run_nullable_model_id",
  },
  {
    up: migration_20260518c_benchmark_coverage_by_cell.up,
    down: migration_20260518c_benchmark_coverage_by_cell.down,
    name: "20260518c_benchmark_coverage_by_cell",
  },
  {
    up: migration_20260518d_benchmark_assignment_byoa.up,
    down: migration_20260518d_benchmark_assignment_byoa.down,
    name: "20260518d_benchmark_assignment_byoa",
  },
  {
    up: migration_20260528_event_submission.up,
    down: migration_20260528_event_submission.down,
    name: "20260528_event_submission",
  },
  {
    up: migration_20260530_backfill_membership_community_id.up,
    down: migration_20260530_backfill_membership_community_id.down,
    name: "20260530_backfill_membership_community_id",
  },
  {
    up: migration_20260530b_activity_event_community_action_created_idx.up,
    down: migration_20260530b_activity_event_community_action_created_idx.down,
    name: "20260530b_activity_event_community_action_created_idx",
  },
  {
    up: migration_20260530c_notifications_infra.up,
    down: migration_20260530c_notifications_infra.down,
    name: "20260530c_notifications_infra",
  },
  {
    up: migration_20260531_notifications_harden_unique_indexes.up,
    down: migration_20260531_notifications_harden_unique_indexes.down,
    name: "20260531_notifications_harden_unique_indexes",
  },
  {
    up: migration_20260531b_community_autonomy_level.up,
    down: migration_20260531b_community_autonomy_level.down,
    name: "20260531b_community_autonomy_level",
  },
  {
    up: migration_20260531c_agent_introductions.up,
    down: migration_20260531c_agent_introductions.down,
    name: "20260531c_agent_introductions",
  },
  {
    up: migration_20260531d_engage_rituals.up,
    down: migration_20260531d_engage_rituals.down,
    name: "20260531d_engage_rituals",
  },
  {
    up: migration_20260531e_activation.up,
    down: migration_20260531e_activation.down,
    name: "20260531e_activation",
  },
  {
    up: migration_20260531f_acquire.up,
    down: migration_20260531f_acquire.down,
    name: "20260531f_acquire",
  },
  {
    up: migration_20260601a_agent_manifest_acceptance.up,
    down: migration_20260601a_agent_manifest_acceptance.down,
    name: "20260601a_agent_manifest_acceptance",
  },
  {
    up: migration_20260601b_invite_role_target_email.up,
    down: migration_20260601b_invite_role_target_email.down,
    name: "20260601b_invite_role_target_email",
  },
  {
    up: migration_20260604a_work_grid_commission.up,
    down: migration_20260604a_work_grid_commission.down,
    name: "20260604a_work_grid_commission",
  },
  {
    up: migration_20260608a_feed_topics_pins_links.up,
    down: migration_20260608a_feed_topics_pins_links.down,
    name: "20260608a_feed_topics_pins_links",
  },
  {
    up: migration_20260608b_classrooms.up,
    down: migration_20260608b_classrooms.down,
    name: "20260608b_classrooms",
  },
  {
    up: migration_20260608c_course_cover.up,
    down: migration_20260608c_course_cover.down,
    name: "20260608c_course_cover",
  },
  {
    up: migration_20260608d_locked_docs_rels.up,
    down: migration_20260608d_locked_docs_rels.down,
    name: "20260608d_locked_docs_rels",
  },
  {
    up: migration_20260608e_lesson_exams.up,
    down: migration_20260608e_lesson_exams.down,
    name: "20260608e_lesson_exams",
  },
  {
    up: migration_20260608f_topic_slug_not_null.up,
    down: migration_20260608f_topic_slug_not_null.down,
    name: "20260608f_topic_slug_not_null",
  },
  {
    up: migration_20260609a_hackathon_teams.up,
    down: migration_20260609a_hackathon_teams.down,
    name: "20260609a_hackathon_teams",
  },
  {
    up: migration_20260609b_team_judging.up,
    down: migration_20260609b_team_judging.down,
    name: "20260609b_team_judging",
  },
  {
    up: migration_20260609c_events_challenge_binding.up,
    down: migration_20260609c_events_challenge_binding.down,
    name: "20260609c_events_challenge_binding",
  },
];
