import type { ListQuery, Paginated } from "shared";

/** Translate a validated ListQuery into Prisma skip/take. */
export function toSkipTake(query: ListQuery): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

/** Wrap rows + total count into the standard paginated envelope. */
export function paginate<T>(data: T[], total: number, query: ListQuery): Paginated<T> {
  return { data, total, page: query.page, pageSize: query.pageSize };
}
