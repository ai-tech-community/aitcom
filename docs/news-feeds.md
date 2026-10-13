# News feeds

`/en/news` and `/nl/news` list rows in `app.news_item`. Rows come from RSS and Atom feeds, or from a bot that posts a story it has already read. The page does not invent stories.

## Configured feeds

`src/server/news/feeds.ts` lists 38 feeds that answered with RSS or Atom on 13 October 2026. Lab blogs include OpenAI, Google, DeepMind, Nvidia, Hugging Face, Mistral, Microsoft, Apple, Amazon, Berkeley, and MIT News. Tech press includes MIT Technology Review, The Verge, TechCrunch, Wired, Ars Technica, The Register, IEEE Spectrum, The Guardian, the Financial Times, ZDNet, InfoQ, and The Conversation. EU and NL outlets include The Decoder, Le Monde, Sifted, Euronews Next, the European Commission digital feed, the EU AI Act site, t3n, NOS, Tweakers, and Computable. Asia outlets include Rest of World, the South China Morning Post, and The Indian Express.

These addresses did not return a usable feed, so they are not in the list: Anthropic, the Meta AI blog, VentureBeat, and the retired Microsoft AI blog. e27 answered in the October check and then failed in production, so migration `20261013d_drop_e27_feed` deletes that stored row and the cron does not put it back. No current Israeli tech feed responded (Calcalist and The Times of Israel refused the request; NoCamels' newest item was from 2024).

The cron keeps the newest 15 items from each feed. The October check, while it still included e27, exposed **532** items within the cap, before two outlets happen to share a URL. e27's 15 items never landed; the other feeds are what a first run stores.

`app.news_feed` stores the same list. The daily cron inserts any built-in URL that is not already there. A row with `enabled = false` is skipped, including a built-in feed. Staff add another feed without a deploy:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example AI","url":"https://example.com/feed.xml"}' \
  https://www.aitcommunity.org/api/news/feeds
```

The route fetches the URL and stores it only when the body parses as RSS or Atom and contains at least one story. A URL already stored returns `inserted: false`.

## Daily ingest

`GET /api/cron/news-feeds` fetches the merged list a few feeds at a time. One feed failing does not stop the others. Article URLs are deduplicated and inserted with `ON CONFLICT DO NOTHING`. Summaries run a few at a time and stop once the run has used its time budget, so the job stays inside the cron limit. The next run summarizes URLs that are still in the feed window and still have no summary.

Vercel runs it daily at 06:20 UTC (`20 6 * * *` in `vercel.json`), with `Authorization: Bearer $CRON_SECRET`.

After deploy, trigger one run instead of waiting for the schedule:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://www.aitcommunity.org/api/cron/news-feeds
```

The JSON body reports how many new rows were stored and, per feed, how many URLs were sent. The route does not insert placeholder stories. Migration `20261013c_news_feeds` only creates `app.news_feed`. Migration `20261013d_drop_e27_feed` deletes the e27 address from that table.

## Submit a verified story

Bots that find a real article can store it directly. The summary has to be text from the source. The route checks that the URL is https and that it answers, then dedupes on the canonical URL (no fragment).

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/story",
    "title": "Headline",
    "source": "Example",
    "published_at": "2026-10-13T12:00:00.000Z",
    "summary": "The excerpt copied from the article."
  }' \
  https://www.aitcommunity.org/api/news/items
```

| Field          | Required | Notes                                                                   |
| -------------- | -------- | ----------------------------------------------------------------------- |
| `url`          | yes      | https. Must answer with a 2xx status. Fragments are ignored for dedupe. |
| `title`        | yes      |                                                                         |
| `source`       | yes      | Shown as the writer when the article has no separate byline.            |
| `published_at` | yes      | ISO 8601.                                                               |
| `summary`      | yes      | The source's own text. Not a line written for this request.             |

`201` means the row is new. `200` with `inserted: false` means that URL was already stored. `401` means the bearer token is missing or wrong. `422` means the URL did not resolve. The same `CRON_SECRET` guards this route, the feed route, and the cron.
