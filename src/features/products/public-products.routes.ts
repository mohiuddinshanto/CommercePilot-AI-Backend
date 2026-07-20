import { Router } from "express";
import { getProductRepository } from "./product.repository.js";
import { parsePaginationParams, buildPaginationMeta, parseSortParams } from "../../utils/pagination.js";
import { sendSuccess } from "../../utils/api-response.js";
import { NotFoundError } from "../../utils/error-handler.js";
import { getDatabase } from "../../config/database.js";
import { COLLECTIONS } from "../../constants/index.js";

const router = Router();

router.get("/categories", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const categories = await db.collection(COLLECTIONS.CATEGORIES).find({ isDeleted: false }).toArray();
    sendSuccess(res, "Public categories retrieved.", categories.map(c => ({ _id: c._id.toString(), name: c.name })));
  } catch (error) { next(error); }
});

function serialize(product: Awaited<ReturnType<ReturnType<typeof getProductRepository>["findPublicById"]>>) {
  if (!product) return null;
  const { _id, name, slug, sku, barcode, shortDescription, description, images, sellingPrice, discountPrice, stock, categoryId, tags, availableFrom, priority, createdAt, updatedAt } = product;
  return { _id: _id.toString(), name, slug, sku, barcode, shortDescription, description, images, sellingPrice, discountPrice, stock, categoryId, tags, availableFrom, priority, createdAt, updatedAt };
}

router.get("/", async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePaginationParams(req.query as { page?: string; limit?: string });
    const sort = parseSortParams({ sortBy: req.query.sortBy as string | undefined, order: req.query.order as string | undefined });
    const { items, total } = await getProductRepository().findPublic({ skip, limit, search: req.query.search as string | undefined, categoryId: req.query.categoryId as string | undefined, minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined, maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined, sort });
    const meta = buildPaginationMeta(page, limit, total);
    sendSuccess(res, "Public products retrieved.", { items: items.map(serialize), total, page: meta.page, pageSize: meta.limit, totalPages: meta.totalPages });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const product = await getProductRepository().findPublicById(String(req.params.id));
    if (!product) throw new NotFoundError("Product");
    sendSuccess(res, "Public product retrieved.", serialize(product));
  } catch (error) { next(error); }
});

export { router as publicProductRoutes };


