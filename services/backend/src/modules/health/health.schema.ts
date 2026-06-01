import { z } from "zod";

export const healthCheckSchema = z.object({
  verbose: z.coerce.boolean().optional().default(false),
});
