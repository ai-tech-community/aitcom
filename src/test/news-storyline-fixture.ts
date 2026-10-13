import type { StorylineDetail } from "@/server/news/storylines";

/** Synthetic reporting for unit tests and the database-free visual preview only. */
export const storyFixture: StorylineDetail = {
  id: "devices",
  slug: "ai-on-your-devices",
  titleEn: "AI is moving onto your devices",
  titleNl: "",
  overviewEn:
    "Smaller models, new laptop hardware, and a demand for private document processing are bringing AI closer to the people using it.",
  overviewNl: "",
  questionsEn: [
    "Can local assistants match cloud tools on difficult tasks?",
    "Does offline processing apply to every feature?",
  ],
  questionsNl: [],
  status: "published",
  revision: 1,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date("2026-03-01"),
  updatedAt: new Date("2026-10-13"),
  connections: [],
  proposedBy: null,
  articles: [
    {
      articleId: "research",
      noteEn:
        "Researchers show useful tasks running on consumer hardware, making local assistants more practical.",
      noteNl: "",
      evidence: "A compact model handles useful tasks on consumer hardware.",
      article: {
        id: "research",
        title: "Smaller models become more capable",
        url: "https://example.org/research",
        author: "Example Research",
        summary: "A compact model handles useful tasks on consumer hardware.",
        publishedAt: new Date("2026-03-01"),
      },
    },
    {
      articleId: "hardware",
      noteEn:
        "More memory gives local models room to run. This addresses one constraint on everyday use.",
      noteNl: "",
      evidence: "New laptops offer more memory for on-device models.",
      article: {
        id: "hardware",
        title: "Laptop maker introduces more AI memory",
        url: "https://example.org/hardware",
        author: "Example Hardware",
        summary: "New laptops offer more memory for on-device models.",
        publishedAt: new Date("2026-06-12"),
      },
    },
    {
      articleId: "launch",
      noteEn:
        "Acme brings local processing into a product people can use with sensitive documents.",
      noteNl: "",
      evidence: "Acme launches an assistant that processes documents locally.",
      article: {
        id: "launch",
        title: "Acme launches an offline AI assistant",
        url: "https://example.org/launch",
        author: "Example News",
        summary: "Acme launches an assistant that processes documents locally.",
        publishedAt: new Date("2026-10-13"),
      },
    },
  ],
};
