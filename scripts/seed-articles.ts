/**
 * Seed script — run with:
 *   pnpm payload run scripts/seed-articles.ts
 *
 * Creates 3 published articles covering all types:
 *   article, tutorial, talk_recording
 */
import { getPayload } from "payload";
import config from "@payload-config";

const payload = await getPayload({ config });

// Clear existing articles before re-seeding
const existing = await payload.find({
  collection: "articles",
  limit: 100,
  pagination: false,
});
for (const doc of existing.docs) {
  await payload.delete({ collection: "articles", id: doc.id });
}
console.log(`Cleared ${existing.docs.length} existing articles`);

// ── helpers ────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 11);
}
function text(t: string, format = 0): LexicalNode {
  return { type: "text", text: t, version: 1, format };
}
function paragraph(...children: LexicalNode[]): LexicalNode {
  return {
    type: "paragraph",
    version: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children,
  };
}
function heading(tag: string, ...children: LexicalNode[]): LexicalNode {
  return {
    type: "heading",
    tag,
    version: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children,
  };
}
function codeBlock(language: string, code: string): LexicalNode {
  // Payload BlocksFeature CodeBlock format (slug: "Code")
  return {
    type: "block",
    version: 2,
    format: "",
    fields: { id: uid(), blockName: "", blockType: "Code", language, code },
  };
}
function listItem(t: string, value: number): LexicalNode {
  return {
    type: "listitem",
    version: 1,
    value,
    indent: 0,
    format: "",
    direction: "ltr",
    children: [text(t)],
  };
}
function bulletList(...items: string[]): LexicalNode {
  return {
    type: "list",
    version: 1,
    listType: "bullet",
    tag: "ul",
    start: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children: items.map((t, i) => listItem(t, i + 1)),
  };
}
function numberedList(...items: string[]): LexicalNode {
  return {
    type: "list",
    version: 1,
    listType: "number",
    tag: "ol",
    start: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children: items.map((t, i) => listItem(t, i + 1)),
  };
}
function blockquote(...children: LexicalNode[]): LexicalNode {
  return {
    type: "quote",
    version: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children,
  };
}
function hr(): LexicalNode {
  return { type: "horizontalrule", version: 1 };
}
type LexicalNode = { type: string; version: number; [k: string]: unknown };
function lexical(...children: LexicalNode[]) {
  return {
    root: {
      type: "root",
      version: 1,
      direction: "ltr" as const,
      format: "" as const,
      indent: 0,
      children,
    },
  };
}

// ── Article 1 — type: article ──────────────────────────────────────────────

await payload.create({
  collection: "articles",
  locale: "en",
  data: {
    title: "Building RAG Systems with LangChain",
    slug: "building-rag-systems-with-langchain",
    type: "article",
    tags: [
      { tag: "RAG" },
      { tag: "LangChain" },
      { tag: "Python" },
      { tag: "AI" },
    ],
    status: "published",
    _status: "published",
    publishedAt: "2026-02-10T10:00:00.000Z",
    content: lexical(
      heading("h2", text("What is RAG?")),
      paragraph(
        text(
          "Retrieval-Augmented Generation (RAG) combines a vector search step with an LLM to ground responses in your own documents. Instead of relying solely on the model's training data, RAG fetches relevant context at query time.",
        ),
      ),
      heading("h3", text("Quick Example with LangChain")),
      codeBlock(
        "python",
        `from langchain.vectorstores import Chroma
from langchain.embeddings import OpenAIEmbeddings
from langchain.chains import RetrievalQA
from langchain.llms import OpenAI

embeddings = OpenAIEmbeddings()
vectorstore = Chroma.from_documents(documents, embeddings)

qa_chain = RetrievalQA.from_chain_type(
    llm=OpenAI(),
    retriever=vectorstore.as_retriever(search_kwargs={"k": 4}),
)

result = qa_chain.run("What does the document say about AI?")
print(result)`,
      ),
      heading("h3", text("Key Components")),
      bulletList(
        "Document loader — ingest PDFs, web pages, databases",
        "Text splitter — chunk documents into overlapping segments",
        "Embedding model — convert text to dense vectors",
        "Vector store — fast approximate nearest-neighbour search",
        "LLM — synthesise an answer from retrieved context",
      ),
    ),
  },
});

console.log("✓ Article 1 created");

// ── Article 2 — type: tutorial ─────────────────────────────────────────────

await payload.create({
  collection: "articles",
  locale: "en",
  data: {
    title: "Getting Started with Ollama: Run LLMs Locally",
    slug: "getting-started-with-ollama",
    type: "tutorial",
    tags: [
      { tag: "Ollama" },
      { tag: "LLM" },
      { tag: "Local AI" },
      { tag: "TypeScript" },
    ],
    mediaUrl:
      "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=1200&q=80",
    status: "published",
    _status: "published",
    publishedAt: "2026-02-15T14:00:00.000Z",
    content: lexical(
      paragraph(
        text(
          "Ollama lets you run large language models entirely on your own hardware. This tutorial walks you through installation and running your first model.",
        ),
      ),
      heading("h2", text("Step 1: Install Ollama")),
      codeBlock(
        "bash",
        `# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# Verify installation
ollama --version`,
      ),
      heading("h2", text("Step 2: Pull and Run a Model")),
      codeBlock(
        "bash",
        `# Pull Llama 3.2 (3B — runs on 8 GB RAM)
ollama pull llama3.2

# Start an interactive chat session
ollama run llama3.2`,
      ),
      heading("h2", text("Step 3: Use the REST API")),
      codeBlock(
        "typescript",
        `const response = await fetch("http://localhost:11434/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "llama3.2",
    messages: [{ role: "user", content: "Why is the sky blue?" }],
    stream: false,
  }),
});

const data = await response.json();
console.log(data.message.content);`,
      ),
      heading("h2", text("Recommended Models")),
      numberedList(
        "llama3.2:3b — fastest, fits in 8 GB VRAM",
        "mistral:7b — excellent instruction following",
        "qwen2.5-coder:7b — best for code generation",
        "nomic-embed-text — embeddings for RAG pipelines",
      ),
    ),
  },
});

console.log("✓ Article 2 created");

// ── Article 3 — type: talk_recording ──────────────────────────────────────

await payload.create({
  collection: "articles",
  locale: "en",
  data: {
    title: "RAG at Scale — Community Talk Recording",
    slug: "rag-at-scale-community-talk",
    type: "talk_recording",
    tags: [
      { tag: "RAG" },
      { tag: "Production" },
      { tag: "pgvector" },
      { tag: "Evaluation" },
    ],
    mediaUrl:
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80",
    status: "published",
    _status: "published",
    publishedAt: "2026-02-20T18:00:00.000Z",
    content: lexical(
      paragraph(
        text(
          "In this talk from our February 2026 meetup, we explore how to scale RAG pipelines beyond the prototype stage to production workloads handling millions of documents.",
        ),
      ),
      blockquote(
        text(
          "The bottleneck is never where you think it is. Profile first, optimise second.",
        ),
      ),
      heading("h2", text("Topics Covered")),
      bulletList(
        "Chunking strategies and their impact on retrieval quality",
        "Choosing between pgvector, Qdrant, and Weaviate",
        "Hybrid search: combining BM25 and dense vectors",
        "Re-ranking with cross-encoders",
        "Evaluation: RAGAS metrics in CI/CD",
      ),
      hr(),
      paragraph(
        text(
          "Watch the full recording below. Slides are available on our GitHub.",
        ),
      ),
    ),
  },
});

console.log("✓ Article 3 created");
console.log("\nAll articles seeded successfully!");
process.exit(0);
