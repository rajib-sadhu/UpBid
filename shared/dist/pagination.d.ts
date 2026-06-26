import { z } from "zod";
/** Query params for any paginated list endpoint. Coerced from strings (query string). */
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    q?: string | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
export type ListQuery = z.infer<typeof listQuerySchema>;
/** Standard envelope for paginated list responses. */
export interface Paginated<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
}
