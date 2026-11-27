# Community news sources

A community admin opens **Settings → News sources** to choose the publishers that appear in the community’s News section. Every community draws from the same database of sources and controls its own selection.

## Choosing a source

Show the community’s selected feeds and let the admin search enabled sources by name or website. Selecting an existing feed makes any articles already associated with it eligible immediately.

For a new publisher, accept a public HTTPS website or RSS/Atom URL. Use the existing safe-fetch transport to resolve the page and its advertised feeds, including redirects. Show a preview with the publisher and a recent headline. When a site advertises multiple feeds, let the admin pick one. If discovery fails, ask for a direct feed URL. Saving requires a readable feed with at least one article.

On confirmation, save the validated feed in `app.news_feed` and link it to the community in one transaction. Reuse the row for an existing feed URL, including when two admins add it concurrently. Respect the global enabled flag. Authorize each change against the target community using the settings permission. Removing a source deletes only that community’s selection.

## Collecting and showing articles

Use the enabled database catalog for the daily collection job. Seed existing built-in addresses idempotently so current sources carry forward. Fetch each feed once per run regardless of how many communities selected it. Continue storing collected articles in the general news archive.

Record the feed-to-article association for each entry encountered, including previously stored URLs and articles appearing in several feeds. Keep one article per canonical article URL. Existing articles gain verified associations when a feed next returns them.

With active selections, show the five most recent distinct articles from those sources. Any link to more articles must keep the community’s selection. If the first collection is pending, explain that articles will appear after collection. With zero selections, use the current sector view, including after the admin removes the final selection. Translate settings and reader copy into English and Dutch.

## Acceptance checks

- An admin of community A can register a publisher. An admin of community B can find and independently select it. Each admin can edit only communities they manage.
- Repeating a save or confirming the same URL concurrently produces one feed and one selection per subscribing community.
- A website with an advertised feed and a direct Atom URL both work. An unreadable feed leaves the catalog and community selection unchanged.
- One article appearing in two feeds appears once for a community subscribed to both and remains visible to communities subscribed to either.
- Removing a selection updates the community view and preserves the shared feed. Removing the final selection restores sector news.
- Verify with focused unit tests using fixtures and mocked storage, plus the affected workspace type-check.
