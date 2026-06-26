import { z } from "zod";
/** Query params for any paginated list endpoint. Coerced from strings (query string). */
export const listQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().optional(),
});
