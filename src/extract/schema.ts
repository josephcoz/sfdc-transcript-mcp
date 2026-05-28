import { z } from "zod";

/**
 * A single field update PROPOSED by the host model from a transcript.
 *
 * The model fills these in; the server re-validates every one of them in
 * apply_update before any write. `sourceSpan` ties the proposal back to the
 * verbatim transcript text that justifies it (used for the audit log).
 */
export const ProposedUpdate = z.object({
  field: z.string().describe("API name of the Salesforce field to update"),
  value: z
    .union([z.string(), z.number(), z.boolean()])
    .describe("Proposed new value (validated against field type/picklist server-side)"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Model's confidence in this proposal, 0..1"),
  sourceSpan: z
    .object({
      speaker: z.enum(["You", "Others"]),
      quote: z.string().describe("Verbatim transcript text supporting this update"),
    })
    .describe("Where in the transcript this update came from"),
});
export type ProposedUpdate = z.infer<typeof ProposedUpdate>;
