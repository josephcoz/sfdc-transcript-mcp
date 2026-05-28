# Plan — `sfdc-transcript-mcp`: a meeting-transcript → Salesforce field-update MCP server

## Context

Joe wants a portfolio-grade tool that turns a meeting transcript into **human-confirmed Salesforce CRM field updates**. Through discussion we settled the architecture deliberately:

- **It's an MCP server ("Architecture A"), not a web app.** The host (Claude Desktop / Claude Code / Cowork) provides the LLM; the server exposes tools and never calls the Anthropic API (so **no Anthropic API key** is needed).
- **Local / distributed, not hosted.** Each user runs it on their own machine against their own org. This deliberately avoids the biggest risk we identified — a central store of other companies' Salesforce tokens (a breach honeypot) and being a data processor for their customer-call data. "Any org" is inherent: each user connects their own org locally.
- The remaining real risks are **prompt injection from the (untrusted) transcript** and **bad writes to a production CRM**. Defending against both — allow-list, validation, dry-run, human-confirm, audit — is the engineering differentiator and the thing worth writing about for the portfolio.

**Intended outcome:** an open-source TypeScript MCP server, installable via an agent-readable README (Claude Code self-installs) and a one-click `.mcpb` bundle (Claude Desktop), that connects to *the user's own* Salesforce org via a browser OAuth flow and safely proposes/applies field updates from a MeetingScribe transcript. This is a **personal** project; it must stay employer-agnostic and never touch the Workstream org.

## Locked decisions (from the user)

| Decision | Choice | Why |
|---|---|---|
| Language | **TypeScript (Node)** | Node ships inside Claude Desktop → `.mcpb` install needs no runtime on the user's machine |
| Salesforce auth | **Own External Client App + OAuth Authorization Code + PKCE** (public client, no secret) | In-browser "Connect Salesforce", no CLI, rep-friendly, showcases OAuth |
| Distribution (v1) | **Local stdio server, shipped as README self-install + `.mcpb` bundle** | Covers Claude Code (self-install) and non-technical Claude Desktop reps (one-click); no hosted/remote in v1 |

## Architecture & safety model (the differentiator)

- Host LLM reads the transcript and calls the server's tools; server never holds an LLM key.
- **Model proposes, server validates, human applies.** `suggest_updates` (read-only) hands the model *constraints + current values*; the model returns proposed updates; `apply_update` (destructive) re-validates everything server-side and only writes after a human confirmation.
- **Hard walls enforced server-side, independent of what the transcript or model says:** a configurable **field allow-list**, a **describe()-`updateable` gate**, **type/length/picklist validation**, **dry-run by default**, an **append-only audit log**, and **sandbox-by-default** (production is explicit opt-in).
- Transcript is treated as **untrusted data, never instructions**; injection-pattern turns are flagged (not silently dropped) for the human + model to see.

## Project structure

```
~/personal-projects/sfdc-transcript-mcp/
├── package.json            # "type":"module"; bin; scripts: build(tsc) dev(tsx) test(vitest) bundle(tsc && mcpb pack)
├── tsconfig.json           # strict, NodeNext, outDir dist/
├── manifest.json           # .mcpb manifest (server.type:"node")
├── README.md               # agent-readable self-install (§ packaging)
├── PROJECT.md              # portfolio writeup
├── .env.example            # SF_CLIENT_ID, SF_LOGIN_HOST, SF_ALLOWLIST_PATH (no secrets)
├── config/field-allowlist.example.json
├── src/
│   ├── index.ts            # entrypoint: McpServer + StdioServerTransport
│   ├── server.ts           # registerTool() wiring only
│   ├── logger.ts           # stderr-only (NEVER stdout — corrupts JSON-RPC)
│   ├── auth/{pkce,oauth,loopback,token-store,hosts}.ts
│   ├── sf/{client,describe,records,update}.ts   # jsforce
│   ├── transcript/{parse,redact}.ts
│   ├── extract/{schema,validate}.ts
│   ├── allowlist.ts
│   ├── audit.ts
│   └── tools/{connect,auth-status,find-record,list-writable-fields,suggest-updates,apply-update}.ts
└── test/{parse,validate,injection}.test.ts + fixtures/{meeting-clean,meeting-injection}.md, describe-account.json
```
Runtime state (tokens, audit, real allow-list) lives under the OS app-data dir via `env-paths` (e.g. `~/Library/Application Support/sfdc-transcript-mcp/`), **not** in the repo. Token files `chmod 0600`.

## Dependencies

- Runtime: `@modelcontextprotocol/sdk` (server), `zod` (tool + extraction schemas), `jsforce` (SF REST: describe / SOQL+SOSL / composite update), `gray-matter` (transcript frontmatter), `open` (launch browser for OAuth), `env-paths` (cross-platform data dir).
- Dev: `typescript`, `@types/node`, `tsx` (dev run), `vitest` (tests), the **`mcpb` CLI** (init/validate/pack/sign).
- **Not** included: any Anthropic/LLM SDK; the `sf` CLI.

## MCP tool surface (6 tools)

Reads → `readOnlyHint: true`; the single write → `destructiveHint: true` (so hosts prompt before it).

| Tool | Annotation | Purpose | Key input | Output |
|---|---|---|---|---|
| `connect_salesforce` | side-effect (auth) | Run PKCE browser flow, cache tokens | `{environment:"sandbox"\|"production"="sandbox", loginHost?, alias?}` | `{connected, orgId, username, instanceUrl, environment}` |
| `auth_status` | readOnly | List cached connections + expiry | `{alias?}` | `{connections:[{alias,username,environment,expiresAt,valid}]}` |
| `find_record` | readOnly | Locate the record the call is about | `{sobject, query, limit?=5, alias?}` | `{matches:[{id,sobject,name,keyFields}]}` |
| `list_writable_fields` | readOnly | allow-list ∩ updateable, with type/picklist meta | `{sobject, alias?}` | `{fields:[{name,type,picklistValues?,length?,currentValueHint?}]}` |
| `suggest_updates` | readOnly | Parse+redact transcript; return turns(+spans/flags), candidate fields, current values — for the **host model** to fill in proposals | `{transcript:{path?}|{text?}, sobject, recordId, alias?}` | `{recordId, transcript:{turns:[{speaker,text,span,injectionFlag?}]}, candidateFields:[{name,type,constraints,currentValue}]}` |
| `apply_update` | **destructive** | Re-validate proposals (allow-list+type+picklist), dry-run or PATCH, write audit | `{recordId, sobject, updates:ProposedUpdate[], dryRun=true, transcriptRef:{title,date,hash}, alias?}` | `{dryRun, applied:[{field,from,to}], rejected:[{field,reason}], auditId}` |

`ProposedUpdate` (zod): `{ field, value: string|number|boolean, confidence?, sourceSpan:{speaker:"You"|"Others", quote} }`.

`apply_update` defaults `dryRun:true`; a real write requires a second call with `dryRun:false`, which is where the host's `destructiveHint` confirmation fires — that's the model-proposes / human-applies boundary.

## PKCE OAuth flow (`connect_salesforce`)

1. Resolve host (`auth/hosts.ts`): sandbox→`https://test.salesforce.com`, production→`https://login.salesforce.com`, or a `loginHost` (My Domain) verbatim. **Default sandbox; production explicit.**
2. PKCE (`auth/pkce.ts`): `code_verifier`=64 random bytes base64url; `code_challenge`=base64url(SHA256(verifier)), `S256`; random `state`.
3. Ephemeral loopback server (`auth/loopback.ts`) on `127.0.0.1:<port>/callback`.
4. `open` authorize URL with `scope=api refresh_token offline_access`.
5. Loopback catches `code`+`state`, verifies state, shows "close this tab", shuts down.
6. Exchange at `/services/oauth2/token` (`grant_type=authorization_code` + `code_verifier`, **no secret**) → access/refresh token, instance_url, identity.
7. Cache to `${dataDir}/tokens/{alias|orgId}.json` (0600): refresh_token, instance_url, environment, username, orgId. **Tokens never logged or audited.**
- Refresh: `sf/client.ts` builds a jsforce `Connection`; on 401/`INVALID_SESSION_ID`, POST `grant_type=refresh_token`, persist, retry once.

## Transcript → suggest → confirm → apply

1. **Ingest** (`transcript/parse.ts`): `{path}|{text}`; `gray-matter` for frontmatter (tolerate real MeetingScribe shape: bare-int `duration`, optional `[[wikilink]]` `attendees`); parse `## Transcript` into ordered `**You:**`/`**Others:**` turns with char-offset `span`s.
2. **Injection-harden** (`transcript/redact.ts`): never treat transcript as instructions; flag turns with injection patterns ("ignore previous", "set the field to", fake tool calls, fenced code) as `injectionFlag:true`; cap lengths; reject control chars.
3. **suggest_updates**: return turns(+flags+spans) + candidate fields (allow-list ∩ updateable, with type/picklist constraints) + each field's **current value**. Host model proposes `ProposedUpdate[]`, each tied to a `sourceSpan`.
4. **Validate** (`extract/validate.ts`, runs inside `apply_update` always): allow-list gate → updateable gate → type/length → picklist membership (restricted picklists reject unknowns; never silently coerce — report normalization). Reject anything ambiguous.
5. **Confirm + apply**: `dryRun:true` returns would-apply diffs + rejections + a dry-run audit entry, no write. `dryRun:false` re-reads current values (warn if changed since suggest), PATCHes via jsforce, writes committed audit entry.
6. **Audit** (`audit.ts`): append-only JSONL `${dataDir}/audit/YYYY-MM.jsonl`: `{auditId,ts,orgId,username,sobject,recordId,field,from,to,dryRun,sourceSpan,transcriptRef}` — no tokens, no full transcript (only the cited span).

## `.mcpb` packaging + README

- **Build:** `npm run build` → `mcpb validate manifest.json` → `mcpb pack` → `sfdc-transcript-mcp.mcpb` (zips manifest + `dist/` + production `node_modules/` + icon). Optional `mcpb sign`. Scaffold with `mcpb init` first to get a known-good manifest, then edit.
- **manifest.json:** `server.type:"node"`, `entry_point:"dist/index.js"`, `mcp_config.command:"node"`, and a `user_config` block prompting for `client_id` (Consumer Key), `login_host` (default `https://test.salesforce.com`), `allowlist_path`. (Confirm current `manifest_version` + interpolation syntax via `mcpb init`.)
- **README (agent-readable):** safety model up front; prereqs (create your own External Client App — enable OAuth, PKCE/public client, scopes `api refresh_token offline_access`, register the fixed loopback redirect URIs; create `field-allowlist.json`); a **Claude Code one-liner** `claude mcp add sfdc-transcript-mcp --env SF_CLIENT_ID=... --env SF_LOGIN_HOST=... --env SF_ALLOWLIST_PATH=... -- node /abs/path/dist/index.js`; a Claude Desktop "open the `.mcpb`" path; an ordered "Agent quickstart" tool sequence so an agent can self-drive.

## Phased roadmap

- **v1 (this plan):** local stdio, sandbox-first; README self-install + `.mcpb`; single-user local token cache; 6 tools; allow-list + validation + dry-run + injection flags + audit. The complete portfolio artifact.
- **v1.1:** multi-org alias UX, picklist-normalization reporting, optimistic-concurrency warnings, a read-only audit-query tool.
- **v2 — hosted/remote multi-tenant. GATED on a written security review.** Needs central encrypted token store, tenant isolation, confidential-client web OAuth, transport auth. Do **not** start token-centralization in v1.
- **vX — optional Workstream-internal fork. GATED on Workstream security sign-off.** Separate repo, their org, their app registration. v1 code stays employer-agnostic.

## Verification & testing

End-to-end against a free **Developer Edition / sandbox** org:
1. Sign up for a Dev org; create the External Client App (PKCE/public, scopes, loopback redirect URIs); author `field-allowlist.json` (e.g. `Account:[Description, Industry, AnnualRevenue]` — include a restricted picklist like `Industry`).
2. `connect_salesforce {environment:"sandbox"}` → browser flow → verify `tokens/*.json` (0600) + `auth_status` `valid:true`; invalidate the access token, call a read tool, confirm silent refresh.
3. `find_record` against a seeded Account.
4. `suggest_updates` with `test/fixtures/meeting-clean.md` → parsed turns, candidate fields limited to allow-list ∩ updateable, current values + spans present.
5. Dry-run: `apply_update {dryRun:true}` → diffs, no record change, dry-run audit entry.
6. Apply: `apply_update {dryRun:false}` → host `destructiveHint` prompt fires, record updated, committed audit entry with cited span.
7. Negative paths: non-allow-listed field, invalid picklist value, over-length string → all rejected.
8. Confirm production requires explicit `environment:"production"` and is never default.

Unit tests (vitest): `parse.test.ts` (MeetingScribe variants), `validate.test.ts` (allow-list/updateable/type/picklist/no-coerce), `injection.test.ts` (`meeting-injection.md` → flags raised **and** a malicious proposal targeting a non-allow-listed field is rejected by `apply_update` regardless of the model), plus a logger test asserting nothing is written to stdout.

## Open items to verify during build (do not assume)

1. **Salesforce External Client App loopback redirect URIs** — whether arbitrary loopback ports are allowed or exact-match only; mitigate by registering a fixed port set (e.g. `:1717-1719`) and trying them in order.
2. **jsforce public-client (no secret) refresh support** — confirm, else hand-roll the refresh-token POST.
3. **`mcpb` CLI package name + current manifest schema/interpolation** — scaffold via `mcpb init`, then edit; validate.
4. **MCP SDK `structuredContent` support** — confirm version; else return JSON-as-text in `content[]`.
5. **External Client App creation** — Connected App creation is disabled by default as of Spring '26; confirm the Dev org allows External Client App creation (or the admin toggle).

## Critical files
- `src/server.ts` — tool registration/wiring
- `src/auth/oauth.ts` + `src/auth/pkce.ts` + `src/auth/loopback.ts` — PKCE browser flow
- `src/transcript/parse.ts` — MeetingScribe parser (input contract: `~/personal-projects/meetingscribe/src/meeting-watcher.py` lines 759–776)
- `src/extract/validate.ts` — the allow-list/type/picklist hard walls
- `src/tools/apply-update.ts` — the destructive write + audit + dry-run boundary
- `manifest.json` + `README.md` — distribution (.mcpb + Claude Code self-install)
