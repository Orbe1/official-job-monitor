# Privacy and security notes

## Data minimization

InternJobs needs account identity, onboarding preferences (role focus, technical interests, location/remote preference, and notification frequency), company follows, saved jobs, application stage/history, optional private notes/dates, alert preferences, and notification records. It does not need resumes, demographic data, employer credentials, or application-form answers. Do not proxy job applications; direct users to the employer's official application URL.

## Sensitive user content

Application notes may contain personal or recruiting-sensitive details. They are viewer-scoped, never included in public job responses or monitor logs, and must be escaped by the UI framework. Production deployments should encrypt storage and backups, restrict administrative access, log access to support tools, and offer export/deletion workflows.

## Web controls

The API validates mutation bodies, applies security headers and request rate limits, and does not render remote HTML. Official-source HTML is normalized to plain structured text before display. External links use safe new-tab attributes. Production auth must protect every viewer-scoped mutation against cross-user access and use same-site/CSRF protections appropriate to the chosen provider.

## Monitor controls

Source configuration contains public URLs/board keys only. Validate protocols and allowed hosts to reduce SSRF risk; block loopback, link-local, private network, and credential-bearing URLs. Limit response size, redirects, concurrency, and duration. Never log raw secrets or unnecessary full responses. Raw snapshots require a retention policy and should omit unrelated personal data when present.

## Known local-mode limitations

Development auth is not authentication. A local SQLite file is not independently access-controlled from the operating-system account. Development notification delivery is not secure email. These modes are appropriate for local/personal evaluation only and are labeled in the product.
