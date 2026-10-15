# Stories reader focus

Approved design: show the story heading, search, and published stories first. Keep a small contribution link in the header. Move the weekly contributor board to the contribution page; topic claiming is already there.

- [x] Remove contributor and weekly-topic queries and sections from the stories index; group heading and secondary contribution link in a wrapping header.
- [x] Show the contributor board on the contribution page with its existing localization and failure fallback.
- [x] Update page tests to verify the index's reader focus and the relocated board; retain search, pagination, empty, and error coverage.
- [x] Run the two touched test files, workspace typecheck, focused lint/formatting, and desktop visual inspection. Mobile browser inspection was interrupted; responsive layout was reviewed in source.

Validation: 13 focused page tests, workspace typecheck, focused ESLint, and the UI detector pass. Desktop preview uses real page components with synthetic reporting and no database access. Review found no actionable issues.
