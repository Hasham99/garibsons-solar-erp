-- AlterTable
ALTER TABLE "CostingCalculation" ADD COLUMN "impBankCharges" REAL;
ALTER TABLE "CostingCalculation" ADD COLUMN "impExcise" REAL;
ALTER TABLE "CostingCalculation" ADD COLUMN "impFreightFob" REAL;
ALTER TABLE "CostingCalculation" ADD COLUMN "impLcValuePkr" REAL;
ALTER TABLE "CostingCalculation" ADD COLUMN "impMarineInsurance" REAL;
ALTER TABLE "CostingCalculation" ADD COLUMN "impMiscAdminGs" REAL;
ALTER TABLE "CostingCalculation" ADD COLUMN "impMiscClearing" REAL;
ALTER TABLE "CostingCalculation" ADD COLUMN "impSalesTax" REAL;
ALTER TABLE "CostingCalculation" ADD COLUMN "impShippingDO" REAL;
ALTER TABLE "CostingCalculation" ADD COLUMN "impTerminalHandling" REAL;
ALTER TABLE "CostingCalculation" ADD COLUMN "impTotalCost" REAL;
ALTER TABLE "CostingCalculation" ADD COLUMN "impTransportation" REAL;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN "usanceDays" INTEGER;

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WarehouseContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "warehouseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WarehouseContact_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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
    "skuName" TEXT,
    "panelsPerContainer" INTEGER,
    "palletsPerContainer" INTEGER,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "defaultSupplierId" TEXT,
    CONSTRAINT "Product_defaultSupplierId_fkey" FOREIGN KEY ("defaultSupplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("active", "brand", "category", "code", "createdAt", "id", "lowStockThreshold", "name", "palletsPerContainer", "panelsPerContainer", "skuName", "updatedAt", "wattage") SELECT "active", "brand", "category", "code", "createdAt", "id", "lowStockThreshold", "name", "palletsPerContainer", "panelsPerContainer", "skuName", "updatedAt", "wattage" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
