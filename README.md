# sfdc-transcript-mcp

A local **MCP server** that turns a meeting transcript into **human-confirmed Salesforce Opportunity updates**. The host (Claude Desktop / Claude Code / Cowork) provides the model; this server exposes tools and never calls an LLM itself — so it needs **no Anthropic API key**.

You connect **your own** Salesforce org via a browser OAuth (PKCE) flow; tokens stay **local to your machine**. There's no hosted service and no central token store. Scope is **Opportunity-only** for now.

## Safety model

The transcript is treated as **untrusted input**. The model *proposes* updates; the server *validates* them; a human *approves* every write. There is no static field allow-list — instead, what makes the human approval meaningful:

- a **describe()-`updateable` gate** (system / formula / audit fields can't be written at all)
- **type / length / picklist validation** against the org's field metadata (no silent coercion; unknown picklist values are rejected)
- **dry-run by default** — a real write requires an explicit second call, which carries `destructiveHint` so the host prompts for confirmation
- **provenance** — every proposed change reports the verbatim transcript quote behind it
- **injection flags** — transcript turns matching injection patterns are flagged (not dropped), and any proposed change whose source quote looks like an injection attempt is marked `suspicious`
- an append-only **audit log** — what changed, from which quote, when (never tokens or the full transcript)

## Tools

| Tool | Kind | Purpose |
|---|---|---|
| `connect_salesforce` | auth | Browser OAuth (PKCE); caches a token locally. Production for a Dev org. |
| `auth_status` | read | List cached connections and whether each token is valid. |
| `find_opportunity` | read | Find the Opportunity a meeting is about, by name. |
| `list_opportunity_fields` | read | Updateable Opportunity fields + metadata, annotated with the current **focus set** (history-tracked / baseline / rep-added) and help text. |
| `update_field_focus` | config | Add/remove fields from the focus set + attach "what to look for" notes. Persists per org. Writes nothing to Salesforce. |
| `suggest_updates` | read | Parse a transcript; return its turns + focus-set candidate fields (current values, constraints, notes) for the model to propose against. |
| `apply_update` | **write** | Re-validate proposals, then dry-run (default) or write + audit. Reports per-change provenance + `suspicious` flags. |

### The focus set

Rather than make you author a field list, the server builds an opinionated **focus set** of Opportunity fields worth watching: the org's **field-history-tracked** fields ∪ a **sales-standard baseline** (`StageName, Amount, CloseDate, NextStep, Description, Type, LeadSource, ForecastCategoryName, Probability`) ∪ anything **you add**. The model uses it (plus each field's help text + picklist) to decide what to look for and to ask you which other fields you fill in. Your additions and notes persist per org.

## Prerequisites

1. **Node ≥ 20.**
2. **A Salesforce org** you control (a free [Developer Edition](https://developer.salesforce.com/signup) org works).

That's it — **no app to create, no client key to copy.** The server ships with a pre-registered public OAuth client (PKCE, no secret — the client_id isn't confidential, same model as the Salesforce CLI). Orgs set to "all users may self-authorize" need nothing further; orgs locked to "admin-approved" connected apps need a one-time admin approval. (Advanced: set `SF_CLIENT_ID` to use your own External Client App.)

## Install

```bash
git clone https://github.com/josephcoz/sfdc-transcript-mcp.git
cd sfdc-transcript-mcp
npm install
npm run build      # compiles to dist/
```

## Register the server

### Claude Desktop / Cowork

Add it to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`), then **restart Claude Desktop**. Cowork picks it up via Desktop's SDK bridge. No env block needed:

```json
{
  "mcpServers": {
    "sfdc-transcript-mcp": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/sfdc-transcript-mcp/dist/index.js"]
    }
  }
}
```

The server runs **on your machine** (Desktop proxies it into Cowork's sandbox), so the OAuth browser flow and `127.0.0.1` loopback work normally.

### Claude Code

```bash
claude mcp add sfdc-transcript-mcp -- node /ABSOLUTE/PATH/TO/sfdc-transcript-mcp/dist/index.js
```

## Agent quickstart

An ordered tool sequence a host agent can self-drive:

1. **`connect_salesforce`** — opens your browser to log in. For a **Developer Edition** org, pass `{"environment": "production"}` (Dev orgs log in via `login.salesforce.com`).
2. **`auth_status`** — confirm the connection is `valid`.
3. **`list_opportunity_fields`** — see the focus set; form an opinion on what to extract, and ask the rep which extra fields they routinely fill in. Persist their answers/notes with **`update_field_focus`**.
4. **`find_opportunity`** — `{"query": "Acme"}` to locate the record (returns its Id).
5. **`suggest_updates`** — `{"transcript": {"path": "test/fixtures/opportunity-call.md"}, "recordId": "<id from step 4>"}`. Returns the turns + focus candidates with current values. The model proposes `updates`, each tied to a verbatim `sourceSpan`.
6. **`apply_update`** with `{"dryRun": true, ...}` — review the would-be diffs, the source quotes, any `suspicious` flags, and rejections. Then call again with `{"dryRun": false, ...}` to write (the host prompts for confirmation).

A synthetic example transcript ships at [`test/fixtures/opportunity-call.md`](./test/fixtures/opportunity-call.md) — a fake customer call whose statements map to standard Opportunity fields (Amount, CloseDate, NextStep, StageName).

## Develop

```bash
npm run dev     # run from source (tsx)
npm test        # vitest
```

## License

MIT
