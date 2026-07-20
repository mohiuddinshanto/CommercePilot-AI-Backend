interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function parsePaginationParams(query: {
  page?: string;
  limit?: string;
}): PaginationParams {
  let page = parseInt(query.page || "", 10);
  let limit = parseInt(query.limit || "", 10);

  if (isNaN(page) || page < 1) {
    page = DEFAULT_PAGE;
  }

  if (isNaN(limit) || limit < 1) {
    limit = DEFAULT_LIMIT;
  }

  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  }

  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

export function buildPaginationMeta(
  page: number,
  limit: number,
  totalItems: number
): PaginationMeta {
  const totalPages = Math.ceil(totalItems / limit);

  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

export function parseSortParams(query: {
  sortBy?: string;
  order?: string;
}): Record<string, 1 | -1> | undefined {
  const allowedSortFields = [
    "createdAt",
    "updatedAt",
    "name",
    "email",
    "sellingPrice",
    "costPrice",
    "stock",
    "totalOrders",
    "totalSpent",
  ];

  const sortBy = query.sortBy;
  const order = query.order === "asc" ? 1 : -1;

  if (sortBy && allowedSortFields.includes(sortBy)) {
    return { [sortBy]: order };
  }

  return undefined;
}
