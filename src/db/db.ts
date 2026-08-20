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
  InventoryCount,
  ExpenseReport,
  OpenTicket,
  DraftCart,
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
  inventoryCounts!: Table<InventoryCount, string>;
  expenseReports!: Table<ExpenseReport, string>;
  openTickets!: Table<OpenTicket, string>;
  draftCarts!: Table<DraftCart, string>;
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
    // v3: daily opening/closing inventory counts.
    this.version(3).stores({
      inventoryCounts: "id, type, date, createdAt",
    });
    // v4: cash-envelope expense reports; link simple Expense rows back to them.
    this.version(4).stores({
      expenses: "id, date, shiftId, recordedBy, createdAt, reportId",
      expenseReports: "id, date, shiftId, staffId, createdAt",
    });
    // v5: open tickets (held/parked carts before payment).
    this.version(5).stores({
      openTickets: "id, shiftId, createdAt",
    });
    // v6: index refId on inventory movements so voiding an order can look up
    // exactly what it deducted without scanning every "sale" movement.
    this.version(6).stores({
      inventoryMovements: "id, ingredientId, type, createdAt, refId",
    });
    // v7: draftCarts (auto-saved in-progress cart per shift, so an accidental
    // reload doesn't lose an unfinished sale) + remove the store's default
    // tax rate that every install previously started with.
    this.version(7)
      .stores({
        draftCarts: "shiftId",
      })
      .upgrade(async (tx) => {
        await tx.table("settings").where("id").equals("settings").modify({ taxRate: 0 });
      });
  }
}

export const db = new LakbaiDB();
