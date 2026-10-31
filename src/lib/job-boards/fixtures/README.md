# Job board fixtures

`greenhouse.json` contains the first two published jobs returned by
`GET https://boards-api.greenhouse.io/v1/boards/greenhouse/jobs?content=true`,
retrieved on 2026-10-31. Only id, title, absolute_url, location, departments,
updated_at and first_published were retained; job descriptions were omitted.
It is a saved response sample, not a promise that these roles are still open.

`ashby.json` contains the first two jobs returned by
`GET https://api.ashbyhq.com/posting-api/job-board/Ashby` on 2026-10-31. Only
title, location, department, publishedAt, jobUrl, applyUrl and isListed were
retained. Descriptions and compensation were omitted. These jobs are saved
parser examples; their current availability can change.

`lever.json` contains the first posting from the public global `leverdemo` board
(`GET https://api.lever.co/v0/postings/leverdemo?mode=json&limit=1&skip=0`),
retrieved 2026-10-31. Only id, text, categories, createdAt, workplaceType,
hostedUrl and applyUrl were retained. Descriptions use synthetic test examples
to cover each section without storing the full public demo advert.

`workable.json` contains the two public jobs returned by
`GET https://www.workable.com/api/accounts/careers?details=true` on 2026-10-31.
The documented URL redirected to the public widget account endpoint. Only
title, shortcode, posting/application URLs, publication/creation dates, flat
location fields, department, employment type and telecommuting were retained.
Descriptions use synthetic test cases. These saved postings may close later.

`personio.xml` contains the first two positions from the public English feed
`https://demo.jobs.personio.de/xml?language=en`, retrieved 2026-10-31. The
jobDescriptions block was omitted to keep this fixture small. Titles, offices,
IDs, employment/schedule and creation metadata are unchanged. Synthetic tests
exercise CDATA, escaped HTML, optional fields and malformed XML.
