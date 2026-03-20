import * as migration_20260223_tags_array from './20260223_tags_array';
import * as migration_20260225_135039_add_colab_url from './20260225_135039_add_colab_url';
import * as migration_20260227_community_rules_sections from './20260227_community_rules_sections';
import * as migration_20260227_forum_schema_upgrade from './20260227_forum_schema_upgrade';
import * as migration_20260312_benchmark_tables from './20260312_benchmark_tables';
import * as migration_20260312_benchmark_model_id from './20260312_benchmark_model_id';
import * as migration_20260320_backfill_member_profiles from './20260320_backfill_member_profiles';

export const migrations = [
  {
    up: migration_20260223_tags_array.up,
    down: migration_20260223_tags_array.down,
    name: '20260223_tags_array',
  },
  {
    up: migration_20260225_135039_add_colab_url.up,
    down: migration_20260225_135039_add_colab_url.down,
    name: '20260225_135039_add_colab_url'
  },
  {
    up: migration_20260227_community_rules_sections.up,
    down: migration_20260227_community_rules_sections.down,
    name: '20260227_community_rules_sections'
  },
  {
    up: migration_20260227_forum_schema_upgrade.up,
    down: migration_20260227_forum_schema_upgrade.down,
    name: '20260227_forum_schema_upgrade'
  },
  {
    up: migration_20260312_benchmark_tables.up,
    down: migration_20260312_benchmark_tables.down,
    name: '20260312_benchmark_tables'
  },
  {
    up: migration_20260312_benchmark_model_id.up,
    down: migration_20260312_benchmark_model_id.down,
    name: '20260312_benchmark_model_id'
  },
  {
    up: migration_20260320_backfill_member_profiles.up,
    down: migration_20260320_backfill_member_profiles.down,
    name: '20260320_backfill_member_profiles'
  },
];
