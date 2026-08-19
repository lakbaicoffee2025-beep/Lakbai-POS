// Core domain types for LAKBAI Coffee POS

export type Role = "admin" | "cashier" | "stockman";

export interface User {
  id: string;
  name: string;
  username: string;
  pinHash: string; // sha-256 hash of PIN/password
  role: Role;
  active: boolean;
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

export type IngredientUnit =
  | "g"
  | "kg"
  | "ml"
  | "L"
  | "pc"
  | "shot"
  | "scoop"
  | "oz";

export interface Ingredient {
  id: string;
  name: string;
  unit: IngredientUnit;
  stockQty: number;
  reorderLevel: number;
  costPerUnit: number; // cost per unit in store currency
  supplierId?: string;
  updatedAt: number;
  sku?: string; // external POS/import identifier, used to match on re-import
}

export interface RecipeItem {
  ingredientId: string;
  qty: number; // quantity of ingredient consumed per one unit of product/variant
}

export interface ProductVariant {
  id: string;
  name: string; // e.g. "12oz", "16oz"
  priceDelta: number; // added to base price
  recipe: RecipeItem[]; // ingredients consumed for this variant (in addition to base recipe if any)
}

export interface ModifierOption {
  id: string;
  name: string;
  priceDelta: number;
  recipe: RecipeItem[]; // extra ingredients consumed, e.g. extra shot
}

export interface ModifierGroup {
  id: string;
  name: string; // e.g. "Milk Options", "Add-ons"
  min: number; // minimum selections required
  max: number; // maximum selections allowed
  required: boolean;
  options: ModifierOption[];
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  basePrice: number;
  imageUrl?: string;
  active: boolean;
  recipe: RecipeItem[]; // base recipe consumed per sale
  variants: ProductVariant[]; // optional size variants
  modifierGroupIds: string[];
  sortOrder: number;
  sku?: string; // external POS/import identifier, used to match on re-import
}

export type DiscountType = "percent" | "fixed";

export interface Discount {
  id: string;
  name: string; // e.g. "Senior Citizen", "PWD", "Employee"
  type: DiscountType;
  value: number; // percent (0-100) or fixed amount
  requiresApproval: boolean;
  active: boolean;
}

export interface CartLineModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
}

export interface CartLine {
  id: string;
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  unitPrice: number; // base price + variant delta
  qty: number;
  modifiers: CartLineModifier[];
  discount?: { id: string; name: string; type: DiscountType; value: number };
  notes?: string;
  lineTotal: number; // computed
}

export type PaymentMethod = "cash" | "gcash" | "split";

export interface Payment {
  method: PaymentMethod;
  cashAmount: number;
  gcashAmount: number;
  gcashRef?: string;
  cashTendered?: number;
  changeDue?: number;
}

export type OrderStatus = "completed" | "voided" | "refunded";

export interface Order {
  id: string;
  orderNo: number;
  shiftId: string;
  cashierId: string;
  cashierName: string;
  items: CartLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  payment: Payment;
  status: OrderStatus;
  createdAt: number;
}

export type ShiftStatus = "open" | "closed";

export interface Shift {
  id: string;
  cashierId: string;
  cashierName: string;
  startingCash: number;
  startedAt: number;
  endedAt?: number;
  status: ShiftStatus;
  // closing counts
  countedCash?: number;
  countedGcash?: number;
  expectedCash?: number;
  expectedGcash?: number;
  cashVariance?: number;
  gcashVariance?: number;
  notes?: string;
}

export interface Expense {
  id: string;
  date: string; // yyyy-MM-dd
  shiftId?: string;
  category: string; // e.g. "Supplies", "Utilities", "Maintenance"
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  recordedBy: string;
  recordedByName: string;
  createdAt: number;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";

export interface PurchaseOrderItem {
  ingredientId: string;
  ingredientName: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  poNo: number;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  items: PurchaseOrderItem[];
  createdBy: string;
  createdByName: string;
  createdAt: number;
  orderedAt?: number;
  receivedAt?: number;
  notes?: string;
}

export type InventoryMovementType =
  | "sale"
  | "purchase_receive"
  | "adjustment_in"
  | "adjustment_out"
  | "waste";

export interface InventoryMovement {
  id: string;
  ingredientId: string;
  ingredientName: string;
  type: InventoryMovementType;
  qty: number; // positive = stock in, negative = stock out
  refType?: "order" | "purchase_order" | "manual";
  refId?: string;
  note?: string;
  createdBy: string;
  createdByName: string;
  createdAt: number;
}

export interface StoreSettings {
  id: "settings"; // singleton
  storeName: string;
  address: string;
  phone: string;
  currency: string; // e.g. "PHP"
  currencySymbol: string; // e.g. "₱"
  taxRate: number; // percent, e.g. 12 for 12% VAT
  taxInclusive: boolean;
  receiptFooter: string;
  logoUrl?: string;
  lowStockDefaultThreshold: number;
  gcashQrUrl?: string;
  // When true, cashiers don't see running sales totals on the Shift screen
  // or the expected cash/GCash hint while closing out — they just record
  // their physical count, blind, and admins review the variance in Reports.
  hideSalesFromCashiers: boolean;
}

export type InventoryCountType = "opening" | "closing";

export interface InventoryCountLine {
  ingredientId: string;
  ingredientName: string;
  unit: IngredientUnit;
  systemQty: number; // stock at the moment the count was taken
  countedQty: number;
  variance: number; // countedQty - systemQty
}

export interface InventoryCount {
  id: string;
  type: InventoryCountType;
  date: string; // yyyy-MM-dd
  lines: InventoryCountLine[];
  notes?: string;
  recordedBy: string;
  recordedByName: string;
  createdAt: number;
}
