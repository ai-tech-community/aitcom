# Magazine editorial shell

Approved by Greg on 29 October 2026 from the local editorial magazine mockup, with the addition of an editor font choice.

Published issues and their articles open in a dedicated magazine shell. The main site navigation, global footer and floating session chrome give way to a compact publication header with a community return link, magazine identity and contents access. Magazine discovery and the magazine shelf remain within the site.

The issue opens with a large masthead, issue number and publication date, followed by an expansive cover and the real issue title. Missing covers use a deliberate typographic composition. The editor's note, issue contents and existing item layouts follow. Information about the publication, subscriptions, sharing and past issues moves below the editorial content instead of competing in a three-column frame.

Article pages use a large centered headline, byline, generous media, and a readable text measure. Existing comments, article contents, sharing, subscriptions, next-item navigation, previews and editor notices remain available. Draft previews use the same shell without becoming publicly readable.

Editors choose the magazine's display font in magazine settings, with an immediate preview. Choices are Italiana (the approved mockup's default), Bodoni Moda, Cormorant Garamond and Geist Sans. The saved choice is magazine-wide and controls mastheads, issue titles and editorial story headings. Long-form body copy uses a comfortable serif reading face; controls keep the site sans serif. Fonts are self-hosted and do not rely on third-party requests at reading time. Existing magazines fall back to Italiana.

The existing magazine settings capability protects the write. The API accepts catalog font IDs, never arbitrary CSS. Store the choice on the magazine through Payload, with a matching migration and generated types. Prepare the migration without executing it: Greg prohibits database writes.

Maintain English, Dutch and French messages. Preserve ADR-0042's access resolver, teaser boundaries, read tracking, indexing and canonical URLs. No synthetic mockup content or stock cover is added to real publications.

Verify the changed component behavior, settings persistence boundary and route detection with focused unit tests; type-check the workspace. Browser screenshots are contingent on the browser host becoming available. No integration tests, full test lanes, database writes or pushes.

The unused `src/payload-generated-schema.ts` predates magazine support. Leave it unchanged, following the existing hosted-materials plan, to avoid unrelated schema churn. Payload derives its runtime schema from collection config.
