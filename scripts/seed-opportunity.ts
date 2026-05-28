// One-off: seed a test Opportunity in the connected Dev org, with values
// deliberately stale vs. test/fixtures/opportunity-call.md so a later
// suggest_updates -> apply_update dry-run produces a meaningful diff.
//
// Run:  npx tsx --env-file=.env scripts/seed-opportunity.ts
// Uses the cached token (silent refresh); no browser flow.

import { withConnection } from "../src/sf/client.js";

const SEED = {
  Name: "Acme Corp - New Platform Subscription",
  StageName: "Qualification",
  CloseDate: "2026-09-30",
  // Amount and NextStep intentionally left unset.
};

await withConnection(undefined, async (conn, token) => {
  const res = await conn.sobject("Opportunity").create(SEED);
  const result = Array.isArray(res) ? res[0] : res;
  if (!result.success) {
    throw new Error(`create failed: ${JSON.stringify(result.errors)}`);
  }
  console.error("Seeded Opportunity:");
  console.error(`  Id:        ${result.id}`);
  console.error(`  Name:      ${SEED.Name}`);
  console.error(`  Stage:     ${SEED.StageName}`);
  console.error(`  CloseDate: ${SEED.CloseDate}`);
  console.error(`  Org:       ${token.username} (${token.orgId})`);
  console.error(`  URL:       ${token.instanceUrl}/${result.id}`);
});
