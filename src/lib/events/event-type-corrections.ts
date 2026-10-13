import type { EventType } from "@/lib/event-metadata";

/**
 * Published events whose stored type is Meetup and whose title or summary
 * says otherwise. The staff seed and the older scout import both wrote
 * `meetup` for every row. Applied by `20261013a_event_type_conference`.
 */
export type EventTypeCorrection = {
  slug: string;
  title: string;
  summary: string;
  type: Extract<EventType, "conference" | "hackathon">;
};

export const EVENT_TYPE_CORRECTIONS: readonly EventTypeCorrection[] = [
  {
    slug: "iclr-2026",
    title: "ICLR 2026",
    summary:
      "The International Conference on Learning Representations, a flagship deep learning conference with broad industry and research relevance.",
    type: "conference",
  },
  {
    slug: "blockstories-horizon-2026-amsterdam-summit-1780069561248",
    title: "Blockstories Horizon 2026: Amsterdam Summit",
    summary:
      "Which trends will drive the next leg of institutional adoption in digital assets?",
    type: "conference",
  },
  {
    slug: "cvpr-2026",
    title: "CVPR 2026",
    summary:
      "The leading computer vision conference, relevant for multimodal AI, perception systems, and advanced applied AI.",
    type: "conference",
  },
  {
    slug: "icml-2026",
    title: "ICML 2026",
    summary:
      "A top machine learning conference with broad influence across modern AI methods, systems, and applications.",
    type: "conference",
  },
  {
    slug: "the-ai-summit-london-2026",
    title: "The AI Summit London 2026",
    summary:
      "A major London AI event blending technical, product, and business AI programming.",
    type: "conference",
  },
  {
    slug: "data-ai-summit-2026",
    title: "Data + AI Summit 2026",
    summary:
      "A major AI and data engineering event spanning production AI, platforms, analytics, and enterprise deployment.",
    type: "conference",
  },
  {
    slug: "ai-engineer-worlds-fair-san-francisco-2026",
    title: "AI Engineer World's Fair - San Francisco 2026",
    summary:
      "A flagship technical AI engineering conference focused on builders, tools, infrastructure, and production AI systems.",
    type: "conference",
  },
  {
    slug: "lisbon-ai-2026",
    title: "Lisbon AI",
    summary:
      "Annual summit for builders shipping AI in production — talks, code, and hallway hacking in Lisbon, 23–24 Sep 2026.",
    type: "conference",
  },
  {
    slug: "the-ai-conference-2026",
    title: "The AI Conference 2026",
    summary:
      "Multi-day applied-AI builders at Pier 48 (Day ZERØ + two conference days), 29 Sep–1 Oct 2026.",
    type: "conference",
  },
  {
    slug: "world-summit-ai-amsterdam-2026",
    title: "World Summit AI Amsterdam 2026",
    summary:
      "Flagship EU summit during World AI Week, 7–8 Oct 2026, Taets Art & Event Park.",
    type: "conference",
  },
  {
    slug: "ai-engineer-new-york-2026",
    title: "AI Engineer New York 2026",
    summary:
      "Production AI engineering, finance and systems focus, 12–14 Oct 2026.",
    type: "conference",
  },
  {
    slug: "techex-amsterdam-hackathon-2026",
    title: "TechEx Amsterdam Hackathon",
    summary:
      "Official AI & Big Data Expo Europe hackathon with lablab.ai: build online from 16 Oct 2026, then finish on-site at RAI Amsterdam.",
    type: "conference",
  },
  {
    slug: "pytorch-conference-north-america-2026",
    title: "PyTorch Conference North America 2026",
    summary:
      "PyTorch Foundation conference at San Jose Convention Center, 20–21 Oct 2026.",
    type: "conference",
  },
  {
    slug: "nvidia-gtc-berlin-2026",
    title: "NVIDIA GTC Berlin 2026",
    summary: "European GTC at Tempodrom and STATION-Berlin, 20–22 Oct 2026.",
    type: "conference",
  },
  {
    slug: "aixia-2026",
    title: "AIxIA 2026",
    summary: "Franco-German AI conference in Strasbourg, 22 Oct 2026.",
    type: "conference",
  },
  {
    slug: "tedai-2026",
    title: "TEDAI 2026",
    summary:
      "Official TED AI in Vienna: talks, discovery day, and community, 28–30 Oct 2026.",
    type: "conference",
  },
  {
    slug: "web-summit-2026",
    title: "Web Summit 2026",
    summary: "Web Summit at MEO Arena in Lisbon, 9–12 Nov 2026.",
    type: "conference",
  },
  {
    slug: "ai-engineer-code-2026",
    title: "AI Engineer CODE",
    summary:
      "AIE CODE returns for its second annual code-focused summit at Hilton Union Square, San Francisco, 10–12 Nov 2026.",
    type: "conference",
  },
  {
    slug: "llmday-london-2026",
    title: "LLMday London",
    summary:
      "Conference on large language models, agents and AI systems at Everyman Canary Wharf, London, Thu 26 Nov 2026.",
    type: "conference",
  },
  {
    slug: "neurips-2026",
    title: "NeurIPS 2026",
    summary:
      "A flagship AI research conference covering neural information processing systems, methods, evaluations, and frontier AI topics.",
    type: "conference",
  },
  {
    slug: "hacktoberfest-hack-day-barcelona-2026",
    title: "Hacktoberfest Hack Day Barcelona",
    summary:
      "One-day Hacktoberfest hack day on open-source AI at Edifici Colom, Barcelona, Sat 24 Oct 2026.",
    type: "hackathon",
  },
];
