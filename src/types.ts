import { z } from "zod";

/** The only sObject this tool targets (Opportunity-only for now / the demo). */
export const OPPORTUNITY = "Opportunity";

/** Salesforce environment selector. Sandbox is the default everywhere. */
export const SfEnvironment = z.enum(["sandbox", "production"]);
export type SfEnvironment = z.infer<typeof SfEnvironment>;
