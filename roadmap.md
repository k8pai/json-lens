# JSON Lens Roadmap

## Purpose

Build JSON Lens into a practical workbench for common JSON operations:
understand, validate, query, transform, compare, generate, export, and automate.

The roadmap is intentionally tracking-ready. Every feature appears in the
tracking table and also has a detailed section. When backend tracking is added,
the table rows should map directly to persisted records.

## Product Principles

1. Make structure visible before asking users to operate on it.
2. Keep destructive operations preview-first and reversible.
3. Treat large JSON as normal, not an edge case.
4. Preserve exactness: key casing, duplicate values, array order, and path shape matter.
5. Separate product surfaces by purpose instead of building one overloaded page.
6. Prefer worker-backed operations for parse-heavy, traversal-heavy, and export-heavy work.
7. Build operation engines first and UI workflows second.

## Backend Tracking Table Shape

Minimum columns requested for backend tracking:

| Column | Purpose |
| --- | --- |
| `feature` | Human-readable feature name. |
| `link_to_section` | Anchor pointing to the descriptive roadmap section. |
| `status` | Delivery state such as Planned, In Progress, Implemented, Deployed, or Deferred. |
| `commit_id` | Git commit that introduced or completed the feature. |

Recommended future columns:

| Column | Purpose |
| --- | --- |
| `id` | Stable roadmap feature id such as F001. |
| `group_slug` | Stable roadmap group key for filtering and navigation. |
| `deployed_at` | Timestamp when the feature was verified in a deployed environment. |
| `notes` | Short implementation or rollout notes. |
| `interaction_model` | Frontend-only, frontend plus backend tracking, backend persisted, backend integration, or optional backend execution. |
| `endpoint_requirement` | Whether the feature needs no endpoint, a shared CRUD endpoint, a shared execution endpoint, or an external integration endpoint. |

## Frontend and Backend Interaction Model

The main architectural mistake to avoid is creating one endpoint per roadmap feature. Most JSON operations are deterministic transformations over a payload that already exists in the browser. Those should stay in frontend code or web workers unless there is a clear reason to persist, share, audit, batch process, or execute the work server-side.

Use these interaction categories:

| Interaction model | Meaning | Backend requirement |
| --- | --- | --- |
| Frontend-only | The feature can run entirely in React state, browser APIs, or web workers. | No endpoint. |
| Frontend plus backend tracking | The feature runs in the frontend, but roadmap status, commit id, and deployment status are persisted. | Roadmap tracking endpoints only. |
| Backend persisted | The feature creates durable user data such as snapshots, saved queries, pipelines, presets, or reports. | Shared CRUD endpoints. |
| Backend integration | The feature reaches outside the browser, such as importing JSON from a URL or checking commit/deployment metadata. | Integration-specific endpoint. |
| Optional backend execution | The feature should normally run locally, but may need server jobs for batch processing or very large payloads. | Shared job endpoint, not feature-specific endpoints. |

## Interaction Classification by Roadmap Area

| Roadmap area | Feature ids | Primary interaction model | Endpoint requirement |
| --- | --- | --- | --- |
| Input, Parsing, and Source Management | F001-F010 | Mixed: frontend-only for paste/upload/drop/clipboard; backend integration for URL import; backend persisted for snapshots. | Use shared source, import, and snapshot endpoints only when persistence or URL fetching is required. |
| Validation and Repair | F011-F020 | Mostly frontend-only. | No feature-specific endpoint; optional report persistence can use a shared report endpoint later. |
| Viewing, Formatting, and Navigation | F021-F032 | Frontend-only. | No endpoint. |
| Querying and Extraction | F033-F042 | Mostly frontend-only; saved queries and exports may be backend persisted. | Use saved-query CRUD and shared export/report endpoints only when persistence is needed. |
| Table and Tabular Analysis | F043-F052 | Frontend-only for analysis; optional backend persisted exports. | No endpoint for table interaction; export can use a shared export endpoint if server-side generation is added. |
| Transformation | F053-F074 | Frontend-only or optional backend execution for large/batch operations. | No feature-specific endpoint; use a shared operation/job endpoint if server execution is introduced. |
| Diff, Compare, Patch, and Merge | F075-F084 | Frontend-only for local compare; optional backend persisted patch history. | No endpoint initially; shared report or snapshot endpoint if patch history is saved. |
| Schema, Types, and Contracts | F085-F092 | Frontend-only for generation; backend persisted for saved schemas. | Use schema CRUD only if users can save/version schemas. |
| Conversion and Export | F093-F100 | Frontend-only for small exports; optional backend execution for large exports. | Use one shared export/job endpoint only if frontend export becomes insufficient. |
| Insights, Quality, and Profiling | F101-F108 | Frontend-only for analysis; backend persisted for reports or metrics history. | No endpoint initially; shared report endpoint later. |
| Privacy, Safety, and Compliance | F109-F114 | Frontend-only by default. | Avoid backend payload endpoints unless user explicitly opts into server processing. |
| Automation and Pipelines | F115-F122 | Backend persisted for pipeline definitions; optional backend execution for batch runs. | Pipeline CRUD plus pipeline-run/job endpoints. |
| Developer and API Utilities | F123-F130 | Mostly frontend-only; optional backend integration for remote API/schema checks. | No endpoint initially except shared import/integration endpoints. |
| Performance and Large-Data Handling | F131-F138 | Frontend worker-first; optional backend execution for long jobs. | Shared job endpoint only after frontend limits are proven. |
| Testing and Verification | F139-F144 | Build-time and developer workflow. | No product endpoint. |

## Recommended Endpoint Count

For the roadmap as written, you should not plan 144 endpoints. A maintainable first backend should have about 8 endpoint groups. That is enough to track feature status, connect features to commits, mark deployment completion, and persist user-created roadmap artifacts without overbuilding.

Recommended MVP endpoint groups:

| Endpoint group | Example routes | Why it exists |
| --- | --- | --- |
| Roadmap features | `GET /api/roadmap/features`, `PATCH /api/roadmap/features/:id` | List roadmap rows and update status or commit id. |
| Roadmap groups | `GET /api/roadmap/groups` | Power grouped navigation, filters, and section links. |
| Deployments | `POST /api/roadmap/features/:id/deployments`, `GET /api/deployments` | Mark a feature as deployed and keep deployment history. |
| Commits | `GET /api/commits/:sha` | Resolve commit metadata when you integrate GitHub or local Git later. |
| Workspaces and snapshots | `GET /api/workspaces`, `POST /api/workspaces`, `PATCH /api/workspaces/:id`, `DELETE /api/workspaces/:id` | Persist user workspaces and JSON snapshots. |
| Saved queries and schemas | `GET /api/artifacts`, `POST /api/artifacts`, `PATCH /api/artifacts/:id`, `DELETE /api/artifacts/:id` | Store saved queries, schemas, export presets, and reports using one artifact model. |
| Pipelines | `GET /api/pipelines`, `POST /api/pipelines`, `PATCH /api/pipelines/:id`, `POST /api/pipelines/:id/runs` | Persist and execute reusable operation pipelines. |
| Jobs | `POST /api/jobs`, `GET /api/jobs/:id`, `DELETE /api/jobs/:id` | Handle optional backend execution for large imports, exports, batch processing, or long-running pipelines. |

Endpoint count guidance:

| Stage | Recommended endpoint groups | Approximate route handlers | When to stop |
| --- | ---: | ---: | --- |
| Tracking-only MVP | 3 | 5-6 | Stop after roadmap rows can update status, commit id, and deployment state. |
| Practical persisted product | 6 | 14-18 | Stop after workspaces, artifacts, and deployment tracking are durable. |
| Advanced backend execution | 8 | 20-24 | Stop after pipelines and long-running jobs are generalized. |

Senior-engineering recommendation:

Start with 3 endpoint groups: roadmap features, roadmap groups, and deployments. Add workspaces, artifacts, and pipelines only when the UI actually needs persistence. Add jobs last. Jobs are powerful, but adding them too early will force you to solve queues, cancellation, payload storage, retention, and security before the product has proven those needs.

## Feature Tracking Table

| Feature | Link to group/descriptive section | Status | Commit ID |
| --- | --- | --- | --- |
| `F001 - Paste JSON` | [Input, Parsing, and Source Management](#input-source) / [Details](#F001) | Implemented | `TBD` |
| `F002 - Upload JSON file` | [Input, Parsing, and Source Management](#input-source) / [Details](#F002) | Implemented | `TBD` |
| `F003 - Drag and drop JSON file` | [Input, Parsing, and Source Management](#input-source) / [Details](#F003) | Implemented | `TBD` |
| `F004 - Load sample JSON` | [Input, Parsing, and Source Management](#input-source) / [Details](#F004) | Implemented | `TBD` |
| `F005 - Import JSON from URL` | [Input, Parsing, and Source Management](#input-source) / [Details](#F005) | Implemented | `TBD` |
| `F006 - Import from clipboard` | [Input, Parsing, and Source Management](#input-source) / [Details](#F006) | Implemented | `TBD` |
| `F007 - Import NDJSON` | [Input, Parsing, and Source Management](#input-source) / [Details](#F007) | Implemented | `TBD` |
| `F008 - Track source metadata` | [Input, Parsing, and Source Management](#input-source) / [Details](#F008) | Implemented | `TBD` |
| `F009 - Reset to original source` | [Input, Parsing, and Source Management](#input-source) / [Details](#F009) | Implemented | `TBD` |
| `F010 - Save workspace snapshot` | [Input, Parsing, and Source Management](#input-source) / [Details](#F010) | Implemented | `TBD` |
| `F011 - Strict JSON validation` | [Validation and Repair](#validation-repair) / [Details](#F011) | Planned | `TBD` |
| `F012 - Line and column parse errors` | [Validation and Repair](#validation-repair) / [Details](#F012) | Planned | `TBD` |
| `F013 - Detect trailing commas` | [Validation and Repair](#validation-repair) / [Details](#F013) | Planned | `TBD` |
| `F014 - Detect single-quoted strings` | [Validation and Repair](#validation-repair) / [Details](#F014) | Planned | `TBD` |
| `F015 - Detect unquoted object keys` | [Validation and Repair](#validation-repair) / [Details](#F015) | Planned | `TBD` |
| `F016 - Detect comments in JSON-like input` | [Validation and Repair](#validation-repair) / [Details](#F016) | Planned | `TBD` |
| `F017 - Detect duplicate object keys` | [Validation and Repair](#validation-repair) / [Details](#F017) | Planned | `TBD` |
| `F018 - Apply repair preview` | [Validation and Repair](#validation-repair) / [Details](#F018) | Planned | `TBD` |
| `F019 - Validate against JSON Schema` | [Validation and Repair](#validation-repair) / [Details](#F019) | Planned | `TBD` |
| `F020 - Produce validation report` | [Validation and Repair](#validation-repair) / [Details](#F020) | Planned | `TBD` |
| `F021 - Beautify JSON` | [Viewing, Formatting, and Navigation](#viewing-navigation) / [Details](#F021) | Implemented | `TBD` |
| `F022 - Minify JSON` | [Viewing, Formatting, and Navigation](#viewing-navigation) / [Details](#F022) | Implemented | `TBD` |
| `F023 - Toggle indentation width` | [Viewing, Formatting, and Navigation](#viewing-navigation) / [Details](#F023) | Implemented | `TBD` |
| `F024 - Collapse and expand nodes` | [Viewing, Formatting, and Navigation](#viewing-navigation) / [Details](#F024) | Implemented | `TBD` |
| `F025 - Expand to depth` | [Viewing, Formatting, and Navigation](#viewing-navigation) / [Details](#F025) | Implemented | `TBD` |
| `F026 - Search keys` | [Viewing, Formatting, and Navigation](#viewing-navigation) / [Details](#F026) | Implemented | `TBD` |
| `F027 - Search values` | [Viewing, Formatting, and Navigation](#viewing-navigation) / [Details](#F027) | Implemented | `TBD` |
| `F028 - Jump to path` | [Viewing, Formatting, and Navigation](#viewing-navigation) / [Details](#F028) | Implemented | `TBD` |
| `F029 - Copy path` | [Viewing, Formatting, and Navigation](#viewing-navigation) / [Details](#F029) | Implemented | `TBD` |
| `F030 - Copy subtree` | [Viewing, Formatting, and Navigation](#viewing-navigation) / [Details](#F030) | Implemented | `TBD` |
| `F031 - Breadcrumb navigation` | [Viewing, Formatting, and Navigation](#viewing-navigation) / [Details](#F031) | Implemented | `TBD` |
| `F032 - Large-file preview mode` | [Viewing, Formatting, and Navigation](#viewing-navigation) / [Details](#F032) | Implemented | `TBD` |
| `F033 - Exact field-name extraction` | [Querying and Extraction](#query-extraction) / [Details](#F033) | Implemented | `TBD` |
| `F034 - Dot-path query` | [Querying and Extraction](#query-extraction) / [Details](#F034) | Implemented | `TBD` |
| `F035 - Bracket-path query` | [Querying and Extraction](#query-extraction) / [Details](#F035) | Implemented | `TBD` |
| `F036 - JSONPath query` | [Querying and Extraction](#query-extraction) / [Details](#F036) | Implemented | `TBD` |
| `F037 - Extract all matching values` | [Querying and Extraction](#query-extraction) / [Details](#F037) | Implemented | `TBD` |
| `F038 - Extract first matching value` | [Querying and Extraction](#query-extraction) / [Details](#F038) | Implemented | `TBD` |
| `F039 - Extract objects containing key` | [Querying and Extraction](#query-extraction) / [Details](#F039) | Implemented | `TBD` |
| `F040 - Filter by predicate` | [Querying and Extraction](#query-extraction) / [Details](#F040) | Implemented | `TBD` |
| `F041 - Save reusable query` | [Querying and Extraction](#query-extraction) / [Details](#F041) | Implemented | `TBD` |
| `F042 - Export query results` | [Querying and Extraction](#query-extraction) / [Details](#F042) | Implemented | `TBD` |
| `F043 - Detect tabular root` | [Table and Tabular Analysis](#table-analysis) / [Details](#F043) | Planned | `TBD` |
| `F044 - Flatten rows for display` | [Table and Tabular Analysis](#table-analysis) / [Details](#F044) | Planned | `TBD` |
| `F045 - Preserve source row path` | [Table and Tabular Analysis](#table-analysis) / [Details](#F045) | Planned | `TBD` |
| `F046 - Generate discovered columns` | [Table and Tabular Analysis](#table-analysis) / [Details](#F046) | Planned | `TBD` |
| `F047 - Sort table rows` | [Table and Tabular Analysis](#table-analysis) / [Details](#F047) | Planned | `TBD` |
| `F048 - Filter table columns` | [Table and Tabular Analysis](#table-analysis) / [Details](#F048) | Planned | `TBD` |
| `F049 - Hide and show columns` | [Table and Tabular Analysis](#table-analysis) / [Details](#F049) | Planned | `TBD` |
| `F050 - Column frequency summary` | [Table and Tabular Analysis](#table-analysis) / [Details](#F050) | Planned | `TBD` |
| `F051 - Copy table row` | [Table and Tabular Analysis](#table-analysis) / [Details](#F051) | Planned | `TBD` |
| `F052 - Export selected table data` | [Table and Tabular Analysis](#table-analysis) / [Details](#F052) | Planned | `TBD` |
| `F053 - Rename key` | [Transformation](#transformation) / [Details](#F053) | Planned | `TBD` |
| `F054 - Bulk rename keys` | [Transformation](#transformation) / [Details](#F054) | Planned | `TBD` |
| `F055 - Transform key case` | [Transformation](#transformation) / [Details](#F055) | Planned | `TBD` |
| `F056 - Remove keys` | [Transformation](#transformation) / [Details](#F056) | Planned | `TBD` |
| `F057 - Keep only selected keys` | [Transformation](#transformation) / [Details](#F057) | Planned | `TBD` |
| `F058 - Move key to path` | [Transformation](#transformation) / [Details](#F058) | Planned | `TBD` |
| `F059 - Flatten object` | [Transformation](#transformation) / [Details](#F059) | Planned | `TBD` |
| `F060 - Unflatten object` | [Transformation](#transformation) / [Details](#F060) | Planned | `TBD` |
| `F061 - Explode array items into rows` | [Transformation](#transformation) / [Details](#F061) | Planned | `TBD` |
| `F062 - Group rows into nested arrays` | [Transformation](#transformation) / [Details](#F062) | Planned | `TBD` |
| `F063 - Convert object map to array` | [Transformation](#transformation) / [Details](#F063) | Planned | `TBD` |
| `F064 - Convert array to object map` | [Transformation](#transformation) / [Details](#F064) | Planned | `TBD` |
| `F065 - Sort object keys` | [Transformation](#transformation) / [Details](#F065) | Planned | `TBD` |
| `F066 - Sort arrays by field` | [Transformation](#transformation) / [Details](#F066) | Planned | `TBD` |
| `F067 - Deduplicate array items` | [Transformation](#transformation) / [Details](#F067) | Planned | `TBD` |
| `F068 - Trim string values` | [Transformation](#transformation) / [Details](#F068) | Planned | `TBD` |
| `F069 - Regex replace values` | [Transformation](#transformation) / [Details](#F069) | Planned | `TBD` |
| `F070 - Convert primitive types` | [Transformation](#transformation) / [Details](#F070) | Planned | `TBD` |
| `F071 - Normalize null-like values` | [Transformation](#transformation) / [Details](#F071) | Planned | `TBD` |
| `F072 - Normalize dates` | [Transformation](#transformation) / [Details](#F072) | Planned | `TBD` |
| `F073 - Add computed field` | [Transformation](#transformation) / [Details](#F073) | Planned | `TBD` |
| `F074 - Mask sensitive values` | [Transformation](#transformation) / [Details](#F074) | Planned | `TBD` |
| `F075 - Compare two JSON documents` | [Diff, Compare, Patch, and Merge](#diff-patch-merge) / [Details](#F075) | Planned | `TBD` |
| `F076 - Show added paths` | [Diff, Compare, Patch, and Merge](#diff-patch-merge) / [Details](#F076) | Planned | `TBD` |
| `F077 - Show removed paths` | [Diff, Compare, Patch, and Merge](#diff-patch-merge) / [Details](#F077) | Planned | `TBD` |
| `F078 - Show changed values` | [Diff, Compare, Patch, and Merge](#diff-patch-merge) / [Details](#F078) | Planned | `TBD` |
| `F079 - Ignore key order` | [Diff, Compare, Patch, and Merge](#diff-patch-merge) / [Details](#F079) | Planned | `TBD` |
| `F080 - Compare arrays by identity key` | [Diff, Compare, Patch, and Merge](#diff-patch-merge) / [Details](#F080) | Planned | `TBD` |
| `F081 - Generate JSON Patch` | [Diff, Compare, Patch, and Merge](#diff-patch-merge) / [Details](#F081) | Planned | `TBD` |
| `F082 - Apply JSON Patch` | [Diff, Compare, Patch, and Merge](#diff-patch-merge) / [Details](#F082) | Planned | `TBD` |
| `F083 - Three-way merge` | [Diff, Compare, Patch, and Merge](#diff-patch-merge) / [Details](#F083) | Planned | `TBD` |
| `F084 - Export patch result` | [Diff, Compare, Patch, and Merge](#diff-patch-merge) / [Details](#F084) | Planned | `TBD` |
| `F085 - Infer JSON Schema` | [Schema, Types, and Contracts](#schema-contracts) / [Details](#F085) | Planned | `TBD` |
| `F086 - Generate TypeScript types` | [Schema, Types, and Contracts](#schema-contracts) / [Details](#F086) | Planned | `TBD` |
| `F087 - Generate Zod schema` | [Schema, Types, and Contracts](#schema-contracts) / [Details](#F087) | Planned | `TBD` |
| `F088 - Generate OpenAPI component schema` | [Schema, Types, and Contracts](#schema-contracts) / [Details](#F088) | Planned | `TBD` |
| `F089 - Detect optional fields` | [Schema, Types, and Contracts](#schema-contracts) / [Details](#F089) | Planned | `TBD` |
| `F090 - Detect nullable fields` | [Schema, Types, and Contracts](#schema-contracts) / [Details](#F090) | Planned | `TBD` |
| `F091 - Detect enum candidates` | [Schema, Types, and Contracts](#schema-contracts) / [Details](#F091) | Planned | `TBD` |
| `F092 - Compare schemas` | [Schema, Types, and Contracts](#schema-contracts) / [Details](#F092) | Planned | `TBD` |
| `F093 - Export JSON` | [Conversion and Export](#conversion-export) / [Details](#F093) | Planned | `TBD` |
| `F094 - Export selected subtree` | [Conversion and Export](#conversion-export) / [Details](#F094) | Planned | `TBD` |
| `F095 - Export CSV` | [Conversion and Export](#conversion-export) / [Details](#F095) | Planned | `TBD` |
| `F096 - Export TSV` | [Conversion and Export](#conversion-export) / [Details](#F096) | Planned | `TBD` |
| `F097 - Export NDJSON` | [Conversion and Export](#conversion-export) / [Details](#F097) | Planned | `TBD` |
| `F098 - Export Markdown table` | [Conversion and Export](#conversion-export) / [Details](#F098) | Planned | `TBD` |
| `F099 - Export generated contract` | [Conversion and Export](#conversion-export) / [Details](#F099) | Planned | `TBD` |
| `F100 - Copy output to clipboard` | [Conversion and Export](#conversion-export) / [Details](#F100) | Planned | `TBD` |
| `F101 - Document structure summary` | [Insights, Quality, and Profiling](#insights-quality) / [Details](#F101) | Planned | `TBD` |
| `F102 - Missing-field report` | [Insights, Quality, and Profiling](#insights-quality) / [Details](#F102) | Planned | `TBD` |
| `F103 - Type distribution by path` | [Insights, Quality, and Profiling](#insights-quality) / [Details](#F103) | Planned | `TBD` |
| `F104 - Frequent value report` | [Insights, Quality, and Profiling](#insights-quality) / [Details](#F104) | Planned | `TBD` |
| `F105 - Duplicate record detection` | [Insights, Quality, and Profiling](#insights-quality) / [Details](#F105) | Planned | `TBD` |
| `F106 - Suspicious value warnings` | [Insights, Quality, and Profiling](#insights-quality) / [Details](#F106) | Planned | `TBD` |
| `F107 - Sensitive-field detection` | [Insights, Quality, and Profiling](#insights-quality) / [Details](#F107) | Planned | `TBD` |
| `F108 - Operation timing metrics` | [Insights, Quality, and Profiling](#insights-quality) / [Details](#F108) | Planned | `TBD` |
| `F109 - Local-only processing mode` | [Privacy, Safety, and Compliance](#privacy-safety) / [Details](#F109) | Planned | `TBD` |
| `F110 - Redaction preview` | [Privacy, Safety, and Compliance](#privacy-safety) / [Details](#F110) | Planned | `TBD` |
| `F111 - Mask values by path` | [Privacy, Safety, and Compliance](#privacy-safety) / [Details](#F111) | Planned | `TBD` |
| `F112 - Hash values by path` | [Privacy, Safety, and Compliance](#privacy-safety) / [Details](#F112) | Planned | `TBD` |
| `F113 - Clear workspace data` | [Privacy, Safety, and Compliance](#privacy-safety) / [Details](#F113) | Planned | `TBD` |
| `F114 - Copy-safe mode` | [Privacy, Safety, and Compliance](#privacy-safety) / [Details](#F114) | Planned | `TBD` |
| `F115 - Save transformation pipeline` | [Automation and Pipelines](#automation-pipelines) / [Details](#F115) | Planned | `TBD` |
| `F116 - Reorder pipeline steps` | [Automation and Pipelines](#automation-pipelines) / [Details](#F116) | Planned | `TBD` |
| `F117 - Disable pipeline step` | [Automation and Pipelines](#automation-pipelines) / [Details](#F117) | Planned | `TBD` |
| `F118 - Run pipeline on current JSON` | [Automation and Pipelines](#automation-pipelines) / [Details](#F118) | Planned | `TBD` |
| `F119 - Import pipeline config` | [Automation and Pipelines](#automation-pipelines) / [Details](#F119) | Planned | `TBD` |
| `F120 - Export pipeline config` | [Automation and Pipelines](#automation-pipelines) / [Details](#F120) | Planned | `TBD` |
| `F121 - Batch process files` | [Automation and Pipelines](#automation-pipelines) / [Details](#F121) | Planned | `TBD` |
| `F122 - Stop long-running pipeline` | [Automation and Pipelines](#automation-pipelines) / [Details](#F122) | Planned | `TBD` |
| `F123 - Format API response` | [Developer and API Utilities](#developer-utilities) / [Details](#F123) | Planned | `TBD` |
| `F124 - Compare request and response payloads` | [Developer and API Utilities](#developer-utilities) / [Details](#F124) | Planned | `TBD` |
| `F125 - Generate mock payload` | [Developer and API Utilities](#developer-utilities) / [Details](#F125) | Planned | `TBD` |
| `F126 - Generate fetch snippet` | [Developer and API Utilities](#developer-utilities) / [Details](#F126) | Planned | `TBD` |
| `F127 - Generate fixture file` | [Developer and API Utilities](#developer-utilities) / [Details](#F127) | Planned | `TBD` |
| `F128 - Generate path assertions` | [Developer and API Utilities](#developer-utilities) / [Details](#F128) | Planned | `TBD` |
| `F129 - Inspect webhook payload` | [Developer and API Utilities](#developer-utilities) / [Details](#F129) | Planned | `TBD` |
| `F130 - Generate path list` | [Developer and API Utilities](#developer-utilities) / [Details](#F130) | Planned | `TBD` |
| `F131 - Worker-backed parsing` | [Performance and Large-Data Handling](#performance-large-data) / [Details](#F131) | Planned | `TBD` |
| `F132 - Worker-backed flattening` | [Performance and Large-Data Handling](#performance-large-data) / [Details](#F132) | Planned | `TBD` |
| `F133 - Worker-backed extraction` | [Performance and Large-Data Handling](#performance-large-data) / [Details](#F133) | Planned | `TBD` |
| `F134 - Worker-backed export` | [Performance and Large-Data Handling](#performance-large-data) / [Details](#F134) | Planned | `TBD` |
| `F135 - Virtualized tree nodes` | [Performance and Large-Data Handling](#performance-large-data) / [Details](#F135) | Planned | `TBD` |
| `F136 - Virtualized table rows` | [Performance and Large-Data Handling](#performance-large-data) / [Details](#F136) | Planned | `TBD` |
| `F137 - Cancelable long operations` | [Performance and Large-Data Handling](#performance-large-data) / [Details](#F137) | Planned | `TBD` |
| `F138 - Large-data stress fixtures` | [Performance and Large-Data Handling](#performance-large-data) / [Details](#F138) | Planned | `TBD` |
| `F139 - Engine unit tests` | [Testing and Verification](#testing-verification) / [Details](#F139) | Planned | `TBD` |
| `F140 - Exact extraction fixtures` | [Testing and Verification](#testing-verification) / [Details](#F140) | Planned | `TBD` |
| `F141 - Transformation round-trip tests` | [Testing and Verification](#testing-verification) / [Details](#F141) | Planned | `TBD` |
| `F142 - Export escaping tests` | [Testing and Verification](#testing-verification) / [Details](#F142) | Planned | `TBD` |
| `F143 - Browser workflow checks` | [Testing and Verification](#testing-verification) / [Details](#F143) | Planned | `TBD` |
| `F144 - Build and lint gates` | [Testing and Verification](#testing-verification) / [Details](#F144) | Planned | `TBD` |

## Roadmap Sections

<a id="input-source"></a>
### Input, Parsing, and Source Management

Load JSON from realistic sources and keep a reliable original-vs-current document boundary.

<a id="F001"></a>
#### F001 - Paste JSON

Description: Accept raw JSON pasted into the editor and treat it as the active source document.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F002"></a>
#### F002 - Upload JSON file

Description: Load local .json files and preserve filename, size, and import metadata.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F003"></a>
#### F003 - Drag and drop JSON file

Description: Support dropping a JSON file onto the workspace without opening a file picker.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F004"></a>
#### F004 - Load sample JSON

Description: Provide useful sample payloads for trying table, query, transform, and export workflows.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F005"></a>
#### F005 - Import JSON from URL

Description: Fetch JSON from a user-provided URL with explicit error, size, and privacy handling.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F006"></a>
#### F006 - Import from clipboard

Description: Read clipboard JSON intentionally and make the import action visible to the user.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F007"></a>
#### F007 - Import NDJSON

Description: Parse newline-delimited JSON as a stream of records instead of a single JSON document.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F008"></a>
#### F008 - Track source metadata

Description: Store source name, byte size, parse time, row count, and imported-at timestamp for later tracking.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F009"></a>
#### F009 - Reset to original source

Description: Restore the active document back to the first loaded version without losing source metadata.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F010"></a>
#### F010 - Save workspace snapshot

Description: Persist the current source, active document, and operation state for later reuse.

Tracking: Status = Implemented. Commit ID = TBD.


<a id="validation-repair"></a>
### Validation and Repair

Detect invalid JSON, explain why it failed, and offer safe repair paths without silent mutation.

<a id="F011"></a>
#### F011 - Strict JSON validation

Description: Validate input with strict JSON semantics and block downstream operations when parsing fails.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F012"></a>
#### F012 - Line and column parse errors

Description: Report the exact line and column for parse failures so users can fix source text quickly.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F013"></a>
#### F013 - Detect trailing commas

Description: Identify trailing commas as a common JSON-like input issue and offer a repair preview.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F014"></a>
#### F014 - Detect single-quoted strings

Description: Identify strings written with single quotes and explain that strict JSON requires double quotes.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F015"></a>
#### F015 - Detect unquoted object keys

Description: Find object keys that are valid JavaScript but invalid JSON and suggest a safe quoted repair.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F016"></a>
#### F016 - Detect comments in JSON-like input

Description: Identify line and block comments that prevent strict JSON parsing.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F017"></a>
#### F017 - Detect duplicate object keys

Description: Warn when the same key appears more than once in the same object before JSON.parse discards evidence.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F018"></a>
#### F018 - Apply repair preview

Description: Show proposed repaired JSON and require user confirmation before mutating the active document.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F019"></a>
#### F019 - Validate against JSON Schema

Description: Validate the active document against a user-provided schema and report path-level failures.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F020"></a>
#### F020 - Produce validation report

Description: Export validation errors, warnings, affected paths, and summary counts as a reusable report.

Tracking: Status = Implemented. Commit ID = TBD.


<a id="viewing-navigation"></a>
### Viewing, Formatting, and Navigation

Make JSON readable and navigable at small and large sizes.

<a id="F021"></a>
#### F021 - Beautify JSON

Description: Format the active document with stable indentation while preserving data values exactly.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F022"></a>
#### F022 - Minify JSON

Description: Remove whitespace for compact transfer or storage without changing document semantics.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F023"></a>
#### F023 - Toggle indentation width

Description: Let users choose formatting width for readability or team conventions.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F024"></a>
#### F024 - Collapse and expand nodes

Description: Allow nested objects and arrays to be folded so users can scan structure faster.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F025"></a>
#### F025 - Expand to depth

Description: Open the tree to a chosen depth to balance overview and detail.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F026"></a>
#### F026 - Search keys

Description: Find matching key names without confusing them with string values.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F027"></a>
#### F027 - Search values

Description: Find primitive values and show the exact paths where they occur.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F028"></a>
#### F028 - Jump to path

Description: Navigate directly to a structural path such as $[].user.name.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F029"></a>
#### F029 - Copy path

Description: Copy the selected node path in a stable notation that handles arrays and unusual keys.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F030"></a>
#### F030 - Copy subtree

Description: Copy the selected object, array, or primitive as valid JSON.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F031"></a>
#### F031 - Breadcrumb navigation

Description: Show the selected node ancestry so users can move up and across nested structures.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F032"></a>
#### F032 - Large-file preview mode

Description: Render safe previews for massive documents instead of trying to display everything immediately.

Tracking: Status = Implemented. Commit ID = TBD.


<a id="query-extraction"></a>
### Querying and Extraction

Let users retrieve values, subdocuments, and row sets without writing one-off scripts.

<a id="F033"></a>
#### F033 - Exact field-name extraction

Description: Extract values by exact, case-sensitive field name and group them by structural path.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F034"></a>
#### F034 - Dot-path query

Description: Read values from simple dot paths for common object traversal workflows.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F035"></a>
#### F035 - Bracket-path query

Description: Support keys containing dots, spaces, or special characters through bracket notation.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F036"></a>
#### F036 - JSONPath query

Description: Support standard JSONPath-style selection for advanced traversal and filtering.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F037"></a>
#### F037 - Extract all matching values

Description: Return every match with value, source path, and encounter order preserved.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F038"></a>
#### F038 - Extract first matching value

Description: Return the first match when users need a quick lookup instead of a full result set.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F039"></a>
#### F039 - Extract objects containing key

Description: Return parent objects that contain a requested key for record-level inspection.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F040"></a>
#### F040 - Filter by predicate

Description: Filter arrays or row sets by equality, contains, regex, range, null, or missing checks.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F041"></a>
#### F041 - Save reusable query

Description: Persist query text and mode so common lookups can be rerun later.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F042"></a>
#### F042 - Export query results

Description: Download or copy query results with source paths and summary counts included.

Tracking: Status = Implemented. Commit ID = TBD.


<a id="table-analysis"></a>
### Table and Tabular Analysis

Turn arrays and nested records into a usable table while preserving the source path.

<a id="F043"></a>
#### F043 - Detect tabular root

Description: Find the best array or record collection to represent as table rows.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F044"></a>
#### F044 - Flatten rows for display

Description: Render nested record fields as columns without destructively changing the active JSON.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F045"></a>
#### F045 - Preserve source row path

Description: Keep each displayed row linked to its original JSON path for inspection and export.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F046"></a>
#### F046 - Generate discovered columns

Description: Create columns from observed keys and paths across the selected row set.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F047"></a>
#### F047 - Sort table rows

Description: Sort rows deterministically with type-aware ordering and stable tie handling.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F048"></a>
#### F048 - Filter table columns

Description: Filter by column value while keeping row identity and source path intact.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F049"></a>
#### F049 - Hide and show columns

Description: Let users control visible columns without changing the underlying data.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F050"></a>
#### F050 - Column frequency summary

Description: Show distinct values, missing counts, null counts, and dominant values per column.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F051"></a>
#### F051 - Copy table row

Description: Copy a selected row as JSON while preserving nested source data where possible.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F052"></a>
#### F052 - Export selected table data

Description: Export selected rows and columns to CSV, JSON, or other supported formats.

Tracking: Status = Planned. Commit ID = TBD.


<a id="transformation"></a>
### Transformation

Change JSON shape, keys, and values through preview-first operations.

<a id="F053"></a>
#### F053 - Rename key

Description: Rename a specific key at a selected path with preview and affected-path reporting.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F054"></a>
#### F054 - Bulk rename keys

Description: Apply multiple key renames from a mapping while detecting collisions before mutation.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F055"></a>
#### F055 - Transform key case

Description: Convert keys to camelCase, PascalCase, snake_case, kebab-case, or CONSTANT_CASE.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F056"></a>
#### F056 - Remove keys

Description: Delete selected keys or paths with a diff preview and undoable operation history.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F057"></a>
#### F057 - Keep only selected keys

Description: Produce a reduced document that preserves only explicitly selected keys or paths.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F058"></a>
#### F058 - Move key to path

Description: Move a value from one path to another while handling target collisions explicitly.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F059"></a>
#### F059 - Flatten object

Description: Convert nested object paths into flat keys for export or tabular workflows.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F060"></a>
#### F060 - Unflatten object

Description: Rebuild nested objects from flat path-like keys using a chosen delimiter or path mode.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F061"></a>
#### F061 - Explode array items into rows

Description: Turn array elements into separate records while preserving parent context.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F062"></a>
#### F062 - Group rows into nested arrays

Description: Nest flat records into arrays by selected grouping keys.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F063"></a>
#### F063 - Convert object map to array

Description: Turn an object keyed by id or name into an array of records with the key retained.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F064"></a>
#### F064 - Convert array to object map

Description: Turn an array into an object map using a selected identity field.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F065"></a>
#### F065 - Sort object keys

Description: Sort object properties consistently for readable diffs and deterministic exports.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F066"></a>
#### F066 - Sort arrays by field

Description: Order array items by a selected field using stable and type-aware sorting.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F067"></a>
#### F067 - Deduplicate array items

Description: Remove duplicate primitives or objects according to selected equality rules.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F068"></a>
#### F068 - Trim string values

Description: Remove leading and trailing whitespace from string values at selected paths.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F069"></a>
#### F069 - Regex replace values

Description: Apply regex replacement to string values with preview and match counts.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F070"></a>
#### F070 - Convert primitive types

Description: Convert numeric strings, booleans, numbers, and strings intentionally with failure reporting.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F071"></a>
#### F071 - Normalize null-like values

Description: Convert empty strings, NA, N/A, undefined-like strings, or custom tokens to null.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F072"></a>
#### F072 - Normalize dates

Description: Convert date-like strings into a selected output format with invalid-date warnings.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F073"></a>
#### F073 - Add computed field

Description: Create a new field from existing values using a controlled expression or template model.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F074"></a>
#### F074 - Mask sensitive values

Description: Replace sensitive values with masked forms while preserving enough shape for debugging.

Tracking: Status = Planned. Commit ID = TBD.


<a id="diff-patch-merge"></a>
### Diff, Compare, Patch, and Merge

Compare documents, generate patches, and apply controlled merges.

<a id="F075"></a>
#### F075 - Compare two JSON documents

Description: Load document A and document B and show structural and value differences.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F076"></a>
#### F076 - Show added paths

Description: List paths that exist only in the comparison document.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F077"></a>
#### F077 - Show removed paths

Description: List paths that existed in the base document but not the comparison document.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F078"></a>
#### F078 - Show changed values

Description: Show before-and-after values for paths present in both documents with different values.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F079"></a>
#### F079 - Ignore key order

Description: Compare objects semantically without treating property order as a difference.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F080"></a>
#### F080 - Compare arrays by identity key

Description: Compare array items by a selected id field instead of only by index.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F081"></a>
#### F081 - Generate JSON Patch

Description: Produce RFC-style patch operations from detected changes.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F082"></a>
#### F082 - Apply JSON Patch

Description: Apply patch operations to a document with preview, errors, and changed paths.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F083"></a>
#### F083 - Three-way merge

Description: Merge base, local, and remote JSON versions while surfacing conflicts.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F084"></a>
#### F084 - Export patch result

Description: Download or copy patch operations and the resulting document.

Tracking: Status = Planned. Commit ID = TBD.


<a id="schema-contracts"></a>
### Schema, Types, and Contracts

Convert observed JSON into reusable contracts for code, APIs, and validation.

<a id="F085"></a>
#### F085 - Infer JSON Schema

Description: Generate a schema from observed payloads with optional, nullable, and mixed-type detection.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F086"></a>
#### F086 - Generate TypeScript types

Description: Generate stable TypeScript type aliases or interfaces from current JSON shape.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F087"></a>
#### F087 - Generate Zod schema

Description: Create runtime validation schemas from inferred or supplied JSON structure.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F088"></a>
#### F088 - Generate OpenAPI component schema

Description: Convert inferred schema into an OpenAPI-compatible component definition.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F089"></a>
#### F089 - Detect optional fields

Description: Identify fields that do not appear in every record or object sample.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F090"></a>
#### F090 - Detect nullable fields

Description: Identify fields that explicitly contain null and reflect that in generated contracts.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F091"></a>
#### F091 - Detect enum candidates

Description: Suggest enums from low-cardinality string or number values with example counts.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F092"></a>
#### F092 - Compare schemas

Description: Show differences between two schema versions for contract review.

Tracking: Status = Planned. Commit ID = TBD.


<a id="conversion-export"></a>
### Conversion and Export

Move JSON and derived results into practical external formats.

<a id="F093"></a>
#### F093 - Export JSON

Description: Download the active document as JSON using the selected formatting mode.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F094"></a>
#### F094 - Export selected subtree

Description: Download only the selected node or query result as JSON.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F095"></a>
#### F095 - Export CSV

Description: Convert tabular data to CSV with predictable escaping and nested-value handling.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F096"></a>
#### F096 - Export TSV

Description: Convert tabular data to tab-separated values for spreadsheet-friendly workflows.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F097"></a>
#### F097 - Export NDJSON

Description: Export arrays or row sets as newline-delimited JSON records.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F098"></a>
#### F098 - Export Markdown table

Description: Convert selected table data into a Markdown table for docs and issue comments.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F099"></a>
#### F099 - Export generated contract

Description: Download TypeScript, JSON Schema, Zod, or OpenAPI output from contract workflows.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F100"></a>
#### F100 - Copy output to clipboard

Description: Copy generated outputs with visible success and failure feedback.

Tracking: Status = Implemented. Commit ID = TBD.


<a id="insights-quality"></a>
### Insights, Quality, and Profiling

Summarize structure, data quality, and performance characteristics.

<a id="F101"></a>
#### F101 - Document structure summary

Description: Show key count, value count, max depth, object count, array count, and primitive count.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F102"></a>
#### F102 - Missing-field report

Description: Find records where expected fields are missing and link results to source paths.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F103"></a>
#### F103 - Type distribution by path

Description: Report observed value types for each path to identify mixed or unstable shapes.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F104"></a>
#### F104 - Frequent value report

Description: Show common values and their counts for selected paths or columns.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F105"></a>
#### F105 - Duplicate record detection

Description: Find duplicate records by full value or selected identity fields.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F106"></a>
#### F106 - Suspicious value warnings

Description: Flag unusual nulls, empty objects, deep nesting, invalid dates, and mixed array shapes.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F107"></a>
#### F107 - Sensitive-field detection

Description: Identify keys and values that look like secrets, tokens, emails, phone numbers, or IDs.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F108"></a>
#### F108 - Operation timing metrics

Description: Capture parse, transform, query, flatten, and export durations for user feedback and debugging.

Tracking: Status = Planned. Commit ID = TBD.


<a id="privacy-safety"></a>
### Privacy, Safety, and Compliance

Protect sensitive payloads through local-first processing and explicit redaction.

<a id="F109"></a>
#### F109 - Local-only processing mode

Description: Keep payload work in the browser unless a user explicitly chooses backend processing.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F110"></a>
#### F110 - Redaction preview

Description: Show exactly which paths and values will be redacted before applying changes.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F111"></a>
#### F111 - Mask values by path

Description: Mask selected values using consistent rules while preserving JSON shape.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F112"></a>
#### F112 - Hash values by path

Description: Hash selected sensitive values for repeatable matching without exposing raw data.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F113"></a>
#### F113 - Clear workspace data

Description: Delete local payload, snapshots, operation history, and derived outputs from the workspace.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F114"></a>
#### F114 - Copy-safe mode

Description: Prevent accidental copying of unredacted sensitive values when safety mode is enabled.

Tracking: Status = Planned. Commit ID = TBD.


<a id="automation-pipelines"></a>
### Automation and Pipelines

Turn repeated JSON work into saved, replayable operation pipelines.

<a id="F115"></a>
#### F115 - Save transformation pipeline

Description: Persist ordered operations so the same JSON workflow can be rerun later.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F116"></a>
#### F116 - Reorder pipeline steps

Description: Allow users to change operation order and preview downstream impact.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F117"></a>
#### F117 - Disable pipeline step

Description: Temporarily skip an operation without deleting its configuration.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F118"></a>
#### F118 - Run pipeline on current JSON

Description: Apply a saved sequence of operations to the active document with step-level results.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F119"></a>
#### F119 - Import pipeline config

Description: Load a serialized pipeline definition after validating version and operation compatibility.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F120"></a>
#### F120 - Export pipeline config

Description: Download a reusable pipeline recipe with stable operation identifiers.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F121"></a>
#### F121 - Batch process files

Description: Apply the same pipeline and export settings to multiple JSON files.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F122"></a>
#### F122 - Stop long-running pipeline

Description: Cancel expensive pipeline execution and preserve the last safe state.

Tracking: Status = Planned. Commit ID = TBD.


<a id="developer-utilities"></a>
### Developer and API Utilities

Support API debugging, fixture creation, and integration workflows.

<a id="F123"></a>
#### F123 - Format API response

Description: Paste or import API responses and format them for debugging and inspection.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F124"></a>
#### F124 - Compare request and response payloads

Description: Inspect how request and response JSON differ for API debugging.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F125"></a>
#### F125 - Generate mock payload

Description: Create sample JSON from a schema or observed shape for local testing.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F126"></a>
#### F126 - Generate fetch snippet

Description: Create a readable TypeScript fetch example using the current JSON as body or response shape.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F127"></a>
#### F127 - Generate fixture file

Description: Export payloads as named test fixtures with stable formatting.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F128"></a>
#### F128 - Generate path assertions

Description: Create test assertion suggestions from selected JSON paths and values.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F129"></a>
#### F129 - Inspect webhook payload

Description: Analyze webhook-style payloads for event type, object id, timestamps, and nested changes.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F130"></a>
#### F130 - Generate path list

Description: List every discovered path with examples, value types, and occurrence counts.

Tracking: Status = Planned. Commit ID = TBD.


<a id="performance-large-data"></a>
### Performance and Large-Data Handling

Keep the UI responsive when documents are large or operations are expensive.

<a id="F131"></a>
#### F131 - Worker-backed parsing

Description: Parse large inputs outside the main React thread to avoid freezing the interface.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F132"></a>
#### F132 - Worker-backed flattening

Description: Generate table rows and columns in a worker for large nested arrays.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F133"></a>
#### F133 - Worker-backed extraction

Description: Run expensive field extraction and query traversal in a worker.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F134"></a>
#### F134 - Worker-backed export

Description: Serialize large CSV, NDJSON, or schema outputs without blocking the UI.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F135"></a>
#### F135 - Virtualized tree nodes

Description: Render only visible JSON tree nodes for large nested documents.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F136"></a>
#### F136 - Virtualized table rows

Description: Render only visible rows while preserving sorting, filtering, and selection behavior.

Tracking: Status = Implemented. Commit ID = TBD.

<a id="F137"></a>
#### F137 - Cancelable long operations

Description: Let users cancel parse, query, transform, export, and pipeline jobs safely.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F138"></a>
#### F138 - Large-data stress fixtures

Description: Generate repeatable large JSON fixtures for performance testing and regression checks.

Tracking: Status = Planned. Commit ID = TBD.


<a id="testing-verification"></a>
### Testing and Verification

Make JSON operations trustworthy through focused engine tests and UI verification.

<a id="F139"></a>
#### F139 - Engine unit tests

Description: Test parse, path, query, transform, diff, schema, and export functions outside React.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F140"></a>
#### F140 - Exact extraction fixtures

Description: Cover arrays, duplicates, unusual keys, nulls, and case-sensitive field matching.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F141"></a>
#### F141 - Transformation round-trip tests

Description: Verify flatten-unflatten, type conversion, sort stability, and redaction behavior.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F142"></a>
#### F142 - Export escaping tests

Description: Verify CSV, TSV, NDJSON, Markdown, and JSON exports handle escaping and nulls correctly.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F143"></a>
#### F143 - Browser workflow checks

Description: Verify real UI workflows change data correctly, not only that controls render.

Tracking: Status = Planned. Commit ID = TBD.

<a id="F144"></a>
#### F144 - Build and lint gates

Description: Keep npm run lint and npm run build as baseline verification for roadmap-related implementation.

Tracking: Status = Implemented. Commit ID = TBD.

## Suggested Implementation Order

### Phase 0 - Foundation

- Define the core JSON document model.
- Define structural path utilities.
- Define a shared operation result shape.
- Define typed worker messaging contracts.
- Add fixture-driven tests for current extraction behavior.

### Phase 1 - Daily-use Workbench

- Improve formatting controls.
- Add tree navigation and path search.
- Add copy path, copy value, and copy subtree.
- Add stricter validation feedback.

### Phase 2 - Query and Extraction

- Add the Query route.
- Keep exact field extraction strict and case-sensitive.
- Add dot-path, bracket-path, and JSONPath query modes.
- Add grouped result export.

### Phase 3 - Transform Workbench

- Add the Transform route.
- Implement preview-first operation pipelines.
- Add key renames, key case transforms, removals, flattening, sorting, and redaction.

### Phase 4 - Compare and Patch

- Add the Compare route.
- Add document A/B input state.
- Add changed-path viewing, JSON Patch generation, and patch preview.

### Phase 5 - Schema and Contracts

- Expand TypeScript generation.
- Add JSON Schema inference, Zod generation, OpenAPI export, and schema validation.

### Phase 6 - Export and Automation

- Expand export formats.
- Add export presets.
- Add pipeline persistence, batch processing, and recipe import/export.

### Phase 7 - Hardening

- Add large-file stress fixtures.
- Add virtualization where needed.
- Add cancellation for long worker jobs.
- Add privacy and redaction safeguards.
- Add browser verification for critical workflows.

## Definition of Done for a JSON Operation

An operation is done only when:

- It works from a reusable library function.
- It has clear input and output types.
- It returns paths for affected data when relevant.
- It handles nulls, arrays, objects, primitives, and empty input intentionally.
- It has a UI preview when it changes data.
- It has copy and export behavior where useful.
- It has focused tests for edge cases.
- It does not freeze the UI on realistic payload sizes.
- It preserves exact key casing unless the operation explicitly changes it.
