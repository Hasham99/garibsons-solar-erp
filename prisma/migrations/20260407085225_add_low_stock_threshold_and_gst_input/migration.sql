-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN "gstInputAmount" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Solar Panel',
    "wattage" INTEGER NOT NULL,
    "brand" TEXT NOT NULL,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Product" ("active", "brand", "category", "code", "createdAt", "id", "name", "updatedAt", "wattage") SELECT "active", "brand", "category", "code", "createdAt", "id", "name", "updatedAt", "wattage" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
