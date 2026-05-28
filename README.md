# sfdc-transcript-mcp

A local **MCP server** that turns a meeting transcript into **human-confirmed Salesforce field updates**. The host (Claude Desktop / Claude Code / Cowork) provides the model; this server exposes tools and never calls an LLM itself — so it needs **no Anthropic API key**.

You connect **your own** Salesforce org via a browser OAuth (PKCE) flow; tokens stay **local to your machine**. There's no hosted service and no central token store.

## Safety model

The transcript is treated as **untrusted input**. The model *proposes* updates; the server *validates* them and a human *applies* them:

- a configurable **field allow-list** (hard wall — writes outside it are rejected regardless of what the transcript or model says)
- a **describe()-`updateable` gate** (system / formula / audit fields can never be written)
- **type / length / picklist validation** against the org's field metadata (no silent coercion; unknown picklist values are rejected)
- **dry-run by default**; real writes require an explicit second call with host confirmation
- an append-only **audit log** (what changed, from which transcript span, when) — never tokens or the full transcript
- transcript turns matching injection patterns are **flagged, not dropped**, so the human and model can see them

## Tools

| Tool | Kind | Purpose |
|---|---|---|
| `connect_salesforce` | auth | Browser OAuth (PKCE); caches a token locally. Sandbox by default; production explicit. |
| `auth_status` | read | List cached connections and whether each token is valid. |
| `find_record` | read | Find the record a meeting is about, by name. |
| `list_writable_fields` | read | The allow-listed, updateable fields for an sObject + type/picklist metadata. |
| `suggest_updates` | read | Parse a transcript and return its turns + candidate fields (with current values) for the model to propose against. Proposes nothing itself. |
| `apply_update` | **write** | Re-validate proposed updates server-side, then dry-run (default) or write + audit. Carries `destructiveHint` so hosts confirm. |

## Prerequisites

1. **Node ≥ 20.**
2. **A Salesforce org** you control (a free [Developer Edition](https://developer.salesforce.com/signup) org works).
3. **Your own External Client App (ECA)** in that org, configured for OAuth:
   - Enable OAuth; **public client** (PKCE, no secret).
   - Scopes: `api refresh_token offline_access`.
   - Callback URL: `https://josephcoz.com/sfdc-connect/` (a static relay that forwards the PKCE-bound code to your local loopback — avoids Salesforce's http/localhost rejection and any cert warning). To run your own relay, set `SF_REDIRECT_URI` to your callback and register that instead.
   - Note the app's **Consumer Key** — that's your `SF_CLIENT_ID`.
4. **A field allow-list** JSON (`{ "Opportunity": ["StageName", ...] }`). See [`config/field-allowlist.example.json`](./config/field-allowlist.example.json). Keep this outside the repo in real use.

## Install

```bash
git clone https://github.com/josephcoz/sfdc-transcript-mcp.git
cd sfdc-transcript-mcp
npm install
npm run build      # compiles to dist/
```

## Configuration (env)

| Var | Required | Purpose |
|---|---|---|
| `SF_CLIENT_ID` | yes | Your ECA's Consumer Key. |
| `SF_ALLOWLIST_PATH` | for writes | Absolute path to your field allow-list JSON. Without it, all writes are rejected. |
| `SF_LOGIN_HOST` | no | Override the default login host (e.g. a My Domain). |
| `SF_REDIRECT_URI` | no | Override the OAuth callback (defaults to the relay above). |

## Register the server

### Claude Desktop / Cowork

Add it to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`), then **restart Claude Desktop**. Cowork picks it up automatically via Desktop's SDK bridge (it appears as `type: sdk`):

```json
{
  "mcpServers": {
    "sfdc-transcript-mcp": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/sfdc-transcript-mcp/dist/index.js"],
      "env": {
        "SF_CLIENT_ID": "your-consumer-key",
        "SF_ALLOWLIST_PATH": "/ABSOLUTE/PATH/TO/field-allowlist.json"
      }
    }
  }
}
```

The server runs **on your machine** (Desktop proxies it into Cowork's sandbox), so the OAuth browser flow and `127.0.0.1` loopback work normally.

### Claude Code

```bash
claude mcp add sfdc-transcript-mcp \
  --env SF_CLIENT_ID=your-consumer-key \
  --env SF_ALLOWLIST_PATH=/ABSOLUTE/PATH/TO/field-allowlist.json \
  -- node /ABSOLUTE/PATH/TO/sfdc-transcript-mcp/dist/index.js
```

## Agent quickstart

An ordered tool sequence a host agent can self-drive:

1. **`connect_salesforce`** — opens your browser to log in. For a **Developer Edition** org, pass `{"environment": "production"}` (Dev orgs log in via `login.salesforce.com`, not the sandbox host).
2. **`auth_status`** — confirm the connection is `valid`.
3. **`find_record`** — `{"sobject": "Opportunity", "query": "Acme"}` to locate the record (returns its Id).
4. **`suggest_updates`** — `{"transcript": {"path": "test/fixtures/opportunity-call.md"}, "sobject": "Opportunity", "recordId": "<id from step 3>"}`. Returns the transcript turns + the allow-listed candidate fields with their current values. The model then proposes `updates` (each tied to a verbatim `sourceSpan`).
5. **`apply_update`** with `{"dryRun": true, ...}` — review the would-be diffs and any rejections. Then call again with `{"dryRun": false, ...}` to write (the host will prompt for confirmation).

A synthetic example transcript ships at [`test/fixtures/opportunity-call.md`](./test/fixtures/opportunity-call.md) — a fake customer call whose statements map to standard Opportunity fields (Amount, CloseDate, NextStep, StageName).

## Develop

```bash
npm run dev     # run from source (tsx)
npm test        # vitest
```

## License

MIT
