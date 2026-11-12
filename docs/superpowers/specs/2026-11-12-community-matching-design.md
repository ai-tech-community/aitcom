# Community member matching

Approved direction: owner-defined connection types, member offers and needs,
explained suggestions, and introductions in the Members page. Owner-led first;
member self-discovery, a visual relationship map, and post-introduction feedback
are subsequent releases.

## Product flow

The Members page retains its directory and adds My connections profile for active
members. Owners and admins also see Matches, Introductions, and Connection types.
The matching controls are never available to guests or inactive memberships.

Owners define a name, description, topics, and prompts for each connection type.
Shared types have one prompt (e.g. hobbies); complementary types have two (e.g.
what I offer and what I need). Editable starting templates cover business,
mentorship, collaboration, hobbies, local connections, and accountability.
Types can be edited and archived; changing the matching mode requires a new type
so existing answers cannot acquire a different meaning.

Members opt in explicitly for this community, select topics in the owner's
questions, and optionally give a city, languages, and meeting preference. These
answers are visible only to that member and community owners/admins. Opting out
immediately removes them from suggestions and manual introduction choices. No
global profile data is silently copied into matching profiles.

Automatic suggestions require at least one shared topic or an offer-to-need
overlap in an active connection type. Case, whitespace, and duplicate answers do
not affect overlap. Same city and shared languages strengthen an actual match;
they alone never create one. Incompatible online/in-person preferences exclude
a pair. Reasons preserve direction: who offers and who seeks a topic. No claims
are inferred from unrelated activity. Matching is deterministic and bounded to
500 opted-in profiles, with explicit coverage text if more exist. Type/member
filters act on that pool before the result limit. Manual introductions can use
any opted-in active member, through a searchable paginated participant endpoint.

Owners can edit the introduction reason and propose a suggested pair, manually
choose two members, or dismiss a pair. Dismissals are community-wide and can be
restored. Existing introductions, including declined ones, exclude automatic
suggestions to avoid repeatedly prompting a declined pair. The owner may manually
propose a declined pair again. Pending/connected introductions cannot be duplicated.

Proposing creates an introduction_request notification for each member. It does
not send email or open a conversation. The existing double-opt-in consent flow
opens the conversation after both accept. The owner's history shows pending,
connected, and declined status. No private intent or participant identity is
added to the existing pre-consent notification surface.

## Boundaries and data

- `src/lib/communities/matching.ts`: shared schemas, templates, normalization,
  and the pure scoring algorithm; no database or UI dependencies.
- `src/server/communities/matching.ts`: scoped data reads, profile validation,
  and transactional manual introduction creation with notifications.
- `src/server/api/routers/community-matching.ts`: communityProcedure endpoints;
  active membership is mandatory, with owner/admin checks for management.
- `src/components/communities/matching/`: directory integration, type editor,
  member profile form, matches and introduction history, focused components.

New app tables: community_connection_type; community_matching_profile (unique
community/user, JSON answers keyed by connection type); community_match_dismissal
(unique community/pair). Introduction receives nullable connection_type_id and
reason. Existing advisory introductions remain valid with null values.

All writes include community constraints. Server validates answers against
current, active types/topics and strips unknown archived answers from scoring.
An empty set of questions is a setup state, not a fabricated match. No automatic
type seeding happens on read. Migration is additive, idempotent, registered in
Payload's migration index, and prepared without applying it to any database.

## Interface

Operate mode; preserve DESIGN.md tokens, Geist typography and existing community
rail. Responsive flat lists, explanation-first match rows, native shared controls,
one primary setup/save/propose action per active form. Accessible tab navigation,
visible labels and errors, English, Dutch and French copy, loading skeletons, retryable errors, helpful
empty states, and disabled pending submissions. Directory pagination must remain
available rather than silently showing only 50 people.

## Verification

Unit-test normalization, matching direction, filters, zero/weak overlap, opt-out,
archived topics, meeting incompatibility, exclusions, and deterministic ranking.
Mocked router tests verify role/tenant isolation, validation, self-pair and opted-out
rejection, duplicate prevention, transactional notifications and rollback. UI tests
exercise the profile, owner setup and propose flows and public/member role gating.
Run only added/touched test files, root `pnpm typecheck`, and changed-file lint.
Never connect tests to a real database, apply migrations, push, or send messages.
