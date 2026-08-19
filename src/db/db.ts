import Dexie, { type Table } from "dexie";
import type {
  User,
  Category,
  Ingredient,
  Product,
  ModifierGroup,
  Discount,
  Order,
  Shift,
  Expense,
  Supplier,
  PurchaseOrder,
  InventoryMovement,
  StoreSettings,
} from "../types";

export class LakbaiDB extends Dexie {
  users!: Table<User, string>;
  categories!: Table<Category, string>;
  ingredients!: Table<Ingredient, string>;
  products!: Table<Product, string>;
  modifierGroups!: Table<ModifierGroup, string>;
  discounts!: Table<Discount, string>;
  orders!: Table<Order, string>;
  shifts!: Table<Shift, string>;
  expenses!: Table<Expense, string>;
  suppliers!: Table<Supplier, string>;
  purchaseOrders!: Table<PurchaseOrder, string>;
  inventoryMovements!: Table<InventoryMovement, string>;
  settings!: Table<StoreSettings, string>;

  constructor() {
    super("lakbai-pos");
    this.version(1).stores({
      users: "id, username, role, active",
      categories: "id, sortOrder",
      ingredients: "id, name",
      products: "id, categoryId, active, sortOrder",
      modifierGroups: "id",
      discounts: "id, active",
      orders: "id, orderNo, shiftId, cashierId, createdAt, status",
      shifts: "id, cashierId, status, startedAt",
      expenses: "id, date, shiftId, recordedBy, createdAt",
      suppliers: "id, name",
      purchaseOrders: "id, poNo, supplierId, status, createdAt",
      inventoryMovements: "id, ingredientId, type, createdAt",
      settings: "id",
    });
    // v2: index `sku` on ingredients/products so CSV re-imports can upsert
    // by external POS SKU instead of creating duplicates.
    this.version(2).stores({
      ingredients: "id, name, sku",
      products: "id, categoryId, active, sortOrder, sku",
    });
  }
}

export const db = new LakbaiDB();
