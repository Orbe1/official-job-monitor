# Source adapters

All adapters fetch the complete accessible official posting set before classification. They return explicit transport/completeness diagnostics; a valid empty result and a failed request are never represented by the same state.

| Family | Level | Public contract | Notes |
| --- | --- | --- | --- |
| Greenhouse | supported | [Official Job Board API](https://developers.greenhouse.io/job-board.html) | Public GET, one complete board response, stable post ID. |
| Ashby | supported | [Official public Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api) | Public GET, listed jobs only, compensation supported. |
| Lever | supported | [Official Postings API](https://github.com/lever/postings-api) | Public GET, explicit pagination, stable posting ID. |
| Workday | experimental | No general public contract | Requires a company-verified official CXS endpoint; fixture/live review required. |
| SmartRecruiters | experimental/manual | [Official Posting API](https://developers.smartrecruiters.com/docs/posting-api) | Some tenants require authorization; InternJobs does not collect or bypass private credentials. |
| Custom JSON | experimental | Company-specific | Requires a reviewed official HTTPS endpoint and explicit field mapping. |

Live requests are opt-in with `MONITOR_MODE=live`. Tests and the default one-shot worker use committed official-source-shaped fixtures. Do not put secrets, authenticated endpoints, or private network URLs in source configuration.
