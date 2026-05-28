# sfdc-transcript-mcp

A local **MCP server** that turns a meeting transcript into **human-confirmed Salesforce field updates**. The host (Claude Desktop / Claude Code / Cowork) provides the model; this server exposes tools and never calls an LLM itself — so it needs **no Anthropic API key**.

You connect **your own** Salesforce org via a browser OAuth (PKCE) flow; tokens stay **local to your machine**. There's no hosted service and no central token store.

## Safety model

The transcript is treated as **untrusted input**. The model *proposes* updates; the server *validates* them and a human *applies* them:

- a configurable **field allow-list** (hard wall — writes outside it are rejected regardless of what the transcript or model says)
- **type / length / picklist validation** against the org's field metadata
- **dry-run by default**; real writes require an explicit second step with host confirmation
- an append-only **audit log** (what changed, from which transcript span, when)
- **sandbox-first** — production is an explicit opt-in

## Status

🚧 Scaffolding. The full implementation plan lives in [`PLAN.md`](./PLAN.md) — tech stack (TypeScript + jsforce), the six MCP tools, the PKCE flow, the transcript→suggest→confirm→apply pipeline, `.mcpb` packaging, the phased roadmap, and the end-to-end verification steps.

## License

TBD.
