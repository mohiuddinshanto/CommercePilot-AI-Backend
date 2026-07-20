import { ObjectId } from "mongodb";
import { InventoryMovementDocument } from "../inventory/inventory.types.js";

type ProductRepo = ReturnType<typeof import("../products/product.repository.js").getProductRepository>;
type InventoryRepo = ReturnType<typeof import("../inventory/inventory.repository.js").getInventoryRepository>;

export async function restoreInventory(
  storeId: string,
  userId: string,
  items: Array<{ productId?: string; bundleId?: string; quantity: number; unitPrice: number }>,
  bundleMap: Map<string, { products: { productId: { toString(): string }; quantity: number }[] }>,
  productRepo: ProductRepo,
  inventoryRepo: InventoryRepo,
): Promise<Omit<InventoryMovementDocument, "_id" | "createdAt">[]> {
  const directProductIds = items.filter((i) => i.productId).map((i) => i.productId!);
  const bundleProductIds: string[] = [];

  for (const item of items) {
    if (item.bundleId) {
      const bundle = bundleMap.get(item.bundleId);
      if (bundle) {
        for (const bp of bundle.products) {
          bundleProductIds.push(bp.productId.toString());
        }
      }
    }
  }

  const allProductIds = [...new Set([...directProductIds, ...bundleProductIds])];

  const allProducts = allProductIds.length > 0
    ? await productRepo.findByIds(allProductIds, storeId)
    : [];
  const productLookup = new Map(allProducts.map((p) => [p._id.toString(), p]));

  const allInventory = allProductIds.length > 0
    ? await inventoryRepo.findByProductIds(
        new ObjectId(storeId),
        allProductIds.map((pid) => new ObjectId(pid))
      )
    : [];
  const inventoryLookup = new Map(
    allInventory.map((inv) => [inv.productId.toString(), inv])
  );

  const movements: Omit<InventoryMovementDocument, "_id" | "createdAt">[] = [];

  for (const item of items) {
    if (item.productId) {
      const product = productLookup.get(item.productId);
      if (product) {
        const newStock = product.stock + item.quantity;
        await productRepo.update(item.productId, storeId, { stock: newStock });

        const inventory = inventoryLookup.get(item.productId);
        if (inventory) {
          await inventoryRepo.update(
            inventory._id,
            new ObjectId(storeId),
            {
              $set: {
                currentStock: newStock,
                availableStock: newStock - inventory.reservedStock,
              },
            }
          );
          movements.push({
            storeId: new ObjectId(storeId),
            inventoryId: inventory._id,
            productId: new ObjectId(item.productId),
            type: "return",
            quantity: item.quantity,
            previousStock: product.stock,
            newStock,
            reference: null,
            notes: null,
            createdBy: new ObjectId(userId),
          });
        }
      }
    }

    if (item.bundleId) {
      const bundle = bundleMap.get(item.bundleId);
      if (bundle) {
        for (const bundleProduct of bundle.products) {
          const pid = bundleProduct.productId.toString();
          const product = productLookup.get(pid);
          if (product) {
            const restoreQty = bundleProduct.quantity * item.quantity;
            const newStock = product.stock + restoreQty;
            await productRepo.update(pid, storeId, { stock: newStock });

            const inventory = inventoryLookup.get(pid);
            if (inventory) {
              await inventoryRepo.update(
                inventory._id,
                new ObjectId(storeId),
                {
                  $set: {
                    currentStock: newStock,
                    availableStock: newStock - inventory.reservedStock,
                  },
                }
              );
              movements.push({
                storeId: new ObjectId(storeId),
                inventoryId: inventory._id,
                productId: new ObjectId(bundleProduct.productId.toString()),
                type: "return",
                quantity: restoreQty,
                previousStock: product.stock,
                newStock,
                reference: null,
                notes: null,
                createdBy: new ObjectId(userId),
              });
            }
          }
        }
      }
    }
  }

  return movements;
}
