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
];
