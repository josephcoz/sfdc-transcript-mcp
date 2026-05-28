# Setup — first time (plain English)

This is the no-jargon guide for getting the tool working. The short version:

> **You do NOT need a "consumer key," a client ID, an API key, or to create any kind of Salesforce app.**
> If anything asks you for one, the answer is: **you don't have one and you don't need one — just skip it and connect to Salesforce normally.** A key is already built in.

## What you actually need

- Your normal **Salesforce login** — the same username and password you sign in with at work. That's it.
- You do **not** need to be a Salesforce admin or developer. (If your company's Salesforce is locked down, an admin may have to click "approve" one time — most orgs don't even need that.)

## Step 1 — Add the tool to Claude (one time)

If your Claude already shows an `sfdc-transcript-mcp` tool, skip to Step 2.

**Claude Desktop / Cowork:** open the file
`~/Library/Application Support/Claude/claude_desktop_config.json`
and add this inside it, then fully quit and reopen Claude Desktop:

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

That's the whole configuration — notice there's **no key, no password, nothing to paste**. (Replace the path with where the project folder lives on your computer.)

*(Prefer the command line? `claude mcp add sfdc-transcript-mcp -- node /ABSOLUTE/PATH/TO/sfdc-transcript-mcp/dist/index.js`)*

## Step 2 — Connect to Salesforce

The first time you ask Claude to do something with an opportunity, a normal
**Salesforce login page opens in your browser**. Log in the way you always do
and click approve. Done — Claude remembers it, so you only do this once.

No key. No copying anything. Just the normal login screen.

## Step 3 — Use it

Talk to Claude in plain English. For example:

> "I just got off a call with Acme Corp — the transcript is at
> `/path/to/the-call.md`. Update the opportunity in Salesforce based on what
> we discussed, but show me the changes before you save anything."

Claude will find the opportunity, read the transcript, and show you a preview of
the proposed changes (a **dry run**). Nothing is saved until you say go.

## "It's asking me for a consumer key / client ID / API key"

You don't need one — it's built in. Just tell Claude to connect to Salesforce
and it will open the normal login page. If a setup screen has a box for a key,
leave it blank.

---

Want the technical details (how it works, the safety model, advanced options)?
See [README.md](./README.md).
