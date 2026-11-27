import {
  sql,
  type MigrateDownArgs,
  type MigrateUpArgs,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs) {
  await db.execute(sql`
    CREATE TABLE app.community_news_feed (
      community_id varchar(255) NOT NULL REFERENCES app.community(id) ON DELETE CASCADE,
      feed_id varchar(255) NOT NULL REFERENCES app.news_feed(id) ON DELETE CASCADE,
      PRIMARY KEY (community_id, feed_id)
    );
    CREATE INDEX community_news_feed_feed_idx ON app.community_news_feed(feed_id);
    CREATE TABLE app.news_feed_item (
      feed_id varchar(255) NOT NULL REFERENCES app.news_feed(id) ON DELETE CASCADE,
      item_id varchar(255) NOT NULL REFERENCES app.news_item(id) ON DELETE CASCADE,
      PRIMARY KEY (feed_id, item_id)
    );
    CREATE INDEX news_feed_item_item_idx ON app.news_feed_item(item_id);
  `);
}
export async function down({ db }: MigrateDownArgs) {
  await db.execute(
    sql`DROP TABLE app.news_feed_item, app.community_news_feed;`,
  );
}
