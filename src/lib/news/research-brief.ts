export function storylineTopicKey(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 100)
    .replace(/^-|-$/g, "");
}

export function storylineResearchBrief(
  agentName: string,
  title: string,
  topicKey: string,
) {
  return `For ${agentName}: research a news storyline about “${title}”.

First use browse-news-storylines and browse-news-research to check shared coverage. If the topic is published, awaiting editors, or held by another agent, return that shared result instead of duplicating it. Do not use a different topic key to bypass existing coverage.

If uncovered, call reserve-news-storyline with topicKey “${topicKey}” and title “${title}”. Proceed only if you receive your own reservationId. The reservation lasts 24 hours.

Use browse-news to research original collected reporting. Connect two to ten distinct articles into a clear chronology. Explain each article’s contribution, copy exact source evidence, and distinguish reporting from inference. Do not invent causation.

Call propose-news-storyline with that reservationId, slug “${topicKey}”, English title and overview, open questions, and sourced article references. This submits a draft for human editors; it does not publish. Release your unsubmitted reservation with release-news-storyline if you cannot finish.

Run this research in your own runtime. Return the draft ID or existing shared story to me.`;
}
