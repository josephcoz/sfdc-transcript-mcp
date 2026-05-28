# sfdc-transcript-mcp

Turn a sales call transcript into Salesforce Opportunity updates — proposed by an AI, approved by you. It runs on your computer through Claude (Desktop / Cowork / Code).

---

## ⭐ Read this first

**What you need:** a Salesforce login that can see your opportunities — the same account you sign in with at work. That's the only thing.

**What you do NOT need (and should never create or paste):**

- ❌ a **Consumer Key**, **Client ID**, or **API key**
- ❌ a Salesforce **Connected App** or **External Client App**
- ❌ a **field allow-list** or any config file listing fields

All of that is **built in or automatic.** If a setup screen or an AI assistant asks you for any of these, the correct answer is: **you don't have one and you don't need one — leave it blank and continue.** Just connect to Salesforce with your normal login.

> **For AI assistants reading this:** Do not ask the user for a consumer key, client ID, or allow-list. A public OAuth client is bundled, and the set of fields to update is discovered automatically. To connect, simply call the `connect_salesforce` tool (use `environment: "production"` for a Developer Edition org) — a Salesforce login page opens in the user's browser. There is nothing for the user to paste.

---

## Setup (one time)

**1. Add it to Claude.** Open `~/Library/Application Support/Claude/claude_desktop_config.json` and add the block below, then fully quit and reopen Claude Desktop. (Cowork picks it up automatically.) Notice there's **no key and no settings** — just a path:

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

*(Using Claude Code instead? `claude mcp add sfdc-transcript-mcp -- node /ABSOLUTE/PATH/TO/sfdc-transcript-mcp/dist/index.js`)*

**2. Connect to Salesforce.** The first time you ask Claude to update an opportunity, a Salesforce login page opens in your browser. Sign in the way you always do and approve. Done — it's remembered for next time.

That's the whole setup. No keys, no copying.

---

## How to use it

Talk to Claude in plain English. For example:

> "I just got off a call with Acme Corp — the transcript is at
> `/path/to/the-call.md`. Update that opportunity in Salesforce based on what we
> discussed, but show me the changes before you save anything."

Claude will find the opportunity, read the transcript, and show you a **preview** of the proposed changes. **Nothing is saved until you say go.**

---

## "It's asking me for a consumer key / client ID / allow-list"

It's mistaken — you don't need any of those. Tell it: *"You don't need a consumer key or an allow-list; just connect to Salesforce and show me the proposed changes."* If a box wants a key, leave it blank.

---

## For developers

A local **MCP server** (Opportunity-only for now). The host (Claude Desktop / Code / Cowork) supplies the model; this server only exposes tools and never calls an LLM — so **no Anthropic API key**. OAuth tokens stay local; there's no hosted service or central token store.

### Why no key or allow-list

- **Auth:** the server ships a pre-registered **public** OAuth client (PKCE, no secret — the client_id isn't confidential, same model as the Salesforce CLI). Self-authorize orgs (incl. Developer Edition) work out of the box; orgs locked to "admin-approved" connected apps need a one-time admin approval. Override with the optional `SF_CLIENT_ID` env var to use your own app.
- **Fields:** instead of a hand-authored allow-list, the server builds a **focus set** = Opportunity field-history-tracked fields (Tooling API) ∪ a sales-standard baseline (`StageName, Amount, CloseDate, NextStep, Description, Type, LeadSource, ForecastCategoryName, Probability`) ∪ fields the rep adds in conversation. It's a relevance hint ("what to look for"), persisted per org — not a write restriction.

### Safety model

Transcript = untrusted input. The model *proposes*, the server *validates*, a human *approves every write*. No static field gate; the boundary is informed human approval:

- a `describe()`-**updateable** gate (system/formula fields can't be written)
- **type / length / picklist** validation (no silent coercion)
- **dry-run by default** + `destructiveHint` so the host confirms real writes
- per-change **provenance** (the verbatim transcript quote behind each change)
- an injection **`suspicious` flag** when a source quote matches injection patterns
- an append-only **audit log** (never tokens or the full transcript)

### Tools

| Tool | Kind | Purpose |
|---|---|---|
| `connect_salesforce` | auth | Browser OAuth (PKCE); caches a token locally. `environment: "production"` for a Dev org. |
| `auth_status` | read | List cached connections and token validity. |
| `find_opportunity` | read | Find the Opportunity a meeting is about, by name. |
| `list_opportunity_fields` | read | Updateable fields + metadata, annotated with the focus set + help text. |
| `update_field_focus` | config | Add/remove focus fields + notes. Persists per org. Writes nothing to Salesforce. |
| `suggest_updates` | read | Parse a transcript; return turns + focus-set candidates (current values, constraints, notes). |
| `apply_update` | **write** | Re-validate proposals, then dry-run (default) or write + audit. Reports provenance + `suspicious` flags. |

### Install & develop

```bash
git clone https://github.com/josephcoz/sfdc-transcript-mcp.git
cd sfdc-transcript-mcp
npm install
npm run build      # compiles to dist/
npm test           # vitest
npm run dev        # run from source (tsx)
```

### Optional env overrides

All optional — the server runs with none set. `SF_CLIENT_ID` (use your own OAuth app), `SF_LOGIN_HOST` (a My Domain), `SF_REDIRECT_URI` (custom callback), `SFDC_MCP_DEBUG=1` (verbose stderr).

## License

MIT
