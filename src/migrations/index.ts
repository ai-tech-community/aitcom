import * as migration_20260223_tags_array from './20260223_tags_array';
import * as migration_20260225_135039_add_colab_url from './20260225_135039_add_colab_url';
import * as migration_20260227_community_rules_sections from './20260227_community_rules_sections';
import * as migration_20260227_forum_schema_upgrade from './20260227_forum_schema_upgrade';

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
];
