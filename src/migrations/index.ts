import * as migration_20260223_tags_array from './20260223_tags_array';

export const migrations = [
  {
    up: migration_20260223_tags_array.up,
    down: migration_20260223_tags_array.down,
    name: '20260223_tags_array',
  },
];
