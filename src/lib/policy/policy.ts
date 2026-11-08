import rawPolicy from "./policy.json";
import { policySchema } from "./schema";

export const policy = policySchema.parse(rawPolicy);
