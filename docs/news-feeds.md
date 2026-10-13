# News feeds

`/en/news` and `/nl/news` list rows in `app.news_item`. That table stayed empty because nothing fetched a feed:

- No feed address was configured in the app.
- `GET /api/cron/collector-worker` only drains collector runs that a person has already queued. It does not start a news ingest.
- `recordFeedNews` runs only after a `feed-items` collector run, so it never saw a feed.

## Configured feeds

`src/server/news/feeds.ts` lists four feeds that answer with RSS or Atom:

- MIT Technology Review, artificial intelligence
- The Verge, AI
- OpenAI News
- Google's AI blog

`GET /api/cron/news-feeds` fetches them, keeps the newest eight items from each, and inserts article URLs that are not already stored. A repeated URL is ignored. The route does not insert placeholder stories.

Vercel runs it every six hours (`20 */6 * * *` in `vercel.json`), with `Authorization: Bearer $CRON_SECRET`.

## First ingest in production

After this is deployed, trigger one run instead of waiting for the schedule:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://www.aitcommunity.org/api/cron/news-feeds
```

The JSON body reports how many new rows each feed stored. Production applies `20261013a_news_rumors` through `scripts/db-apply-on-deploy.ts` on the deploy; that migration is only the member-rumor table and does not seed stories.
