import { z } from "zod";

/** sObjects this tool can target. Kept deliberately small; expand as needed. */
export const SObject = z.enum(["Account", "Opportunity", "Contact", "Lead"]);
export type SObjectName = z.infer<typeof SObject>;

/** Salesforce environment selector. Sandbox is the default everywhere. */
export const SfEnvironment = z.enum(["sandbox", "production"]);
export type SfEnvironment = z.infer<typeof SfEnvironment>;
