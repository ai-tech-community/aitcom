/**
 * Reputable AI news feeds. Each URL was fetched on 13 October 2026 and
 * parsed as RSS or Atom. The news table stays empty until a run of
 * `GET /api/cron/news-feeds` fetches these. Nothing here is invented copy.
 *
 * Feeds that did not return a usable document were left out: Anthropic
 * (404), the Meta AI blog (404), VentureBeat (429), and the old Microsoft
 * AI blog (410). A few others parsed but had not published in more than
 * a year, so they are not in this list either.
 *
 * More specific hosts come before their parent (news.microsoft.com before
 * microsoft.com) so a story keeps the label of the feed that published it.
 */
export const NEWS_FEEDS = [
  {
    name: "MIT Technology Review — Artificial intelligence",
    url: "https://www.technologyreview.com/topic/artificial-intelligence/feed/",
  },
  {
    name: "The Verge — AI",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
  },
  {
    name: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
  },
  {
    name: "Google AI blog",
    url: "https://blog.google/innovation-and-ai/technology/ai/rss/",
  },
  {
    name: "Google DeepMind",
    url: "https://deepmind.google/blog/rss.xml",
  },
  {
    name: "Nvidia — Generative AI",
    url: "https://blogs.nvidia.com/blog/category/generative-ai/feed/",
  },
  {
    name: "Hugging Face blog",
    url: "https://huggingface.co/blog/feed.xml",
  },
  {
    name: "Mistral",
    url: "https://mistral.ai/rss.xml",
  },
  {
    name: "Microsoft Source — AI",
    url: "https://news.microsoft.com/source/topics/ai/feed/",
  },
  {
    name: "Microsoft Research",
    url: "https://www.microsoft.com/en-us/research/feed/",
  },
  {
    name: "Apple Machine Learning Research",
    url: "https://machinelearning.apple.com/rss.xml",
  },
  {
    name: "Amazon Science",
    url: "https://www.amazon.science/index.rss",
  },
  {
    name: "Berkeley Artificial Intelligence Research",
    url: "https://bair.berkeley.edu/blog/feed.xml",
  },
  {
    name: "MIT News — Artificial intelligence",
    url: "https://news.mit.edu/topic/mitartificial-intelligence2-rss.xml",
  },
  {
    name: "TechCrunch — Artificial intelligence",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
  },
  {
    name: "Wired — AI",
    url: "https://www.wired.com/feed/tag/ai/latest/rss",
  },
  {
    name: "Ars Technica — AI",
    url: "https://arstechnica.com/ai/feed/",
  },
  {
    name: "The Register — AI and ML",
    url: "https://www.theregister.com/software/ai_ml/headlines.atom",
  },
  {
    name: "IEEE Spectrum — Artificial intelligence",
    url: "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss",
  },
  {
    name: "The Guardian — Artificial intelligence",
    url: "https://www.theguardian.com/technology/artificialintelligenceai/rss",
  },
  {
    name: "Financial Times — Artificial intelligence",
    url: "https://www.ft.com/artificial-intelligence?format=rss",
  },
  {
    name: "ZDNet — Artificial intelligence",
    url: "https://www.zdnet.com/topic/artificial-intelligence/rss.xml",
  },
  {
    name: "InfoQ — AI, ML and Data Engineering",
    url: "https://feed.infoq.com/ai-ml-data-eng/",
  },
  {
    name: "The Conversation — Artificial intelligence",
    url: "https://theconversation.com/topics/artificial-intelligence-ai-90/articles.atom",
  },
  {
    name: "Last Week in AI",
    url: "https://lastweekin.ai/feed",
  },
  {
    name: "The Decoder",
    url: "https://the-decoder.com/feed/",
  },
  {
    name: "Le Monde — Intelligence artificielle",
    url: "https://www.lemonde.fr/intelligence-artificielle/rss_full.xml",
  },
  {
    name: "Sifted — Artificial intelligence",
    url: "https://sifted.eu/sector/artificial-intelligence/feed",
  },
  {
    name: "Euronews Next",
    url: "https://www.euronews.com/rss?level=vertical&name=next",
  },
  {
    name: "European Commission — Digital strategy",
    url: "https://digital-strategy.ec.europa.eu/en/rss.xml",
  },
  {
    name: "EU AI Act",
    url: "https://artificialintelligenceact.eu/feed/",
  },
  {
    name: "t3n",
    url: "https://t3n.de/rss.xml",
  },
  {
    name: "NOS — Tech",
    url: "https://feeds.nos.nl/nosnieuwstech",
  },
  {
    name: "Tweakers",
    url: "https://tweakers.net/feeds/mixed.xml",
  },
  {
    name: "Computable",
    url: "https://www.computable.nl/feed/",
  },
  {
    name: "Rest of World — Artificial intelligence",
    url: "https://restofworld.org/tag/artificial-intelligence/feed/",
  },
  {
    name: "South China Morning Post — Tech",
    url: "https://www.scmp.com/rss/36/feed",
  },
  {
    name: "The Indian Express — Artificial intelligence",
    url: "https://indianexpress.com/section/technology/artificial-intelligence/feed/",
  },
  {
    name: "e27",
    url: "https://e27.co/feed/",
  },
] as const;

/**
 * Newest entries kept from each feed on one run.
 * On 13 October 2026 the feeds above exposed 532 items within this cap
 * (some publish fewer than 15), before URL deduplication.
 */
export const NEWS_FEED_ITEM_LIMIT = 15;
