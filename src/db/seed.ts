import { db } from "./db";
import { newId } from "../lib/id";
import { hashPin } from "../lib/hash";
import type {
  Category,
  Ingredient,
  Product,
  ModifierGroup,
  Discount,
  StoreSettings,
  User,
} from "../types";

export async function seedIfEmpty(): Promise<void> {
  // Pre-hash PINs outside the transaction (crypto.subtle doesn't touch IDB).
  const adminHash = await hashPin("1234");
  const cashierHash = await hashPin("1111");
  const stockmanHash = await hashPin("2222");

  // The empty-check and every write happen inside one readwrite transaction so
  // a second concurrent call (e.g. React StrictMode's double effect invoke in
  // dev) sees a non-empty `users` table and bails out instead of racing on
  // singleton keys like settings.add({ id: "settings" }).
  await db.transaction(
    "rw",
    [
      db.users,
      db.settings,
      db.categories,
      db.ingredients,
      db.modifierGroups,
      db.products,
      db.discounts,
      db.suppliers,
    ],
    async () => {
      const userCount = await db.users.count();
      if (userCount > 0) return;
      await seedData(adminHash, cashierHash, stockmanHash);
    }
  );
}

async function seedData(
  adminHash: string,
  cashierHash: string,
  stockmanHash: string
): Promise<void> {
  // ---- Users ----
  const users: User[] = [
    {
      id: newId(),
      name: "Admin",
      username: "admin",
      pinHash: adminHash,
      role: "admin",
      active: true,
      createdAt: Date.now(),
    },
    {
      id: newId(),
      name: "Cashier",
      username: "cashier",
      pinHash: cashierHash,
      role: "cashier",
      active: true,
      createdAt: Date.now(),
    },
    {
      id: newId(),
      name: "Stockman",
      username: "stockman",
      pinHash: stockmanHash,
      role: "stockman",
      active: true,
      createdAt: Date.now(),
    },
  ];
  await db.users.bulkAdd(users);

  // ---- Settings ----
  const settings: StoreSettings = {
    id: "settings",
    storeName: "LAKBAI Coffee",
    address: "",
    phone: "",
    currency: "PHP",
    currencySymbol: "₱",
    taxRate: 12,
    taxInclusive: true,
    receiptFooter: "Salamat sa pagbili! See you again soon.",
    lowStockDefaultThreshold: 10,
  };
  await db.settings.add(settings);

  // ---- Categories ----
  const catCoffee: Category = { id: newId(), name: "Coffee", sortOrder: 0 };
  const catNonCoffee: Category = {
    id: newId(),
    name: "Non-Coffee",
    sortOrder: 1,
  };
  const catPastries: Category = {
    id: newId(),
    name: "Pastries",
    sortOrder: 2,
  };
  await db.categories.bulkAdd([catCoffee, catNonCoffee, catPastries]);

  // ---- Ingredients ----
  const ing = {
    espresso: {
      id: newId(),
      name: "Espresso Beans",
      unit: "g" as const,
      stockQty: 5000,
      reorderLevel: 1000,
      costPerUnit: 1.2,
      updatedAt: Date.now(),
    },
    milk: {
      id: newId(),
      name: "Fresh Milk",
      unit: "ml" as const,
      stockQty: 10000,
      reorderLevel: 2000,
      costPerUnit: 0.08,
      updatedAt: Date.now(),
    },
    water: {
      id: newId(),
      name: "Water",
      unit: "ml" as const,
      stockQty: 50000,
      reorderLevel: 5000,
      costPerUnit: 0.001,
      updatedAt: Date.now(),
    },
    sugar: {
      id: newId(),
      name: "Sugar Syrup",
      unit: "ml" as const,
      stockQty: 5000,
      reorderLevel: 1000,
      costPerUnit: 0.05,
      updatedAt: Date.now(),
    },
    chocolate: {
      id: newId(),
      name: "Chocolate Syrup",
      unit: "ml" as const,
      stockQty: 3000,
      reorderLevel: 500,
      costPerUnit: 0.15,
      updatedAt: Date.now(),
    },
    matchaPowder: {
      id: newId(),
      name: "Matcha Powder",
      unit: "g" as const,
      stockQty: 1000,
      reorderLevel: 200,
      costPerUnit: 0.6,
      updatedAt: Date.now(),
    },
    cup12: {
      id: newId(),
      name: "12oz Cup",
      unit: "pc" as const,
      stockQty: 500,
      reorderLevel: 100,
      costPerUnit: 3,
      updatedAt: Date.now(),
    },
    cup16: {
      id: newId(),
      name: "16oz Cup",
      unit: "pc" as const,
      stockQty: 500,
      reorderLevel: 100,
      costPerUnit: 4,
      updatedAt: Date.now(),
    },
    creamCheese: {
      id: newId(),
      name: "Cream Cheese Foam",
      unit: "ml" as const,
      stockQty: 2000,
      reorderLevel: 400,
      costPerUnit: 0.2,
      updatedAt: Date.now(),
    },
    croissantDough: {
      id: newId(),
      name: "Croissant",
      unit: "pc" as const,
      stockQty: 50,
      reorderLevel: 10,
      costPerUnit: 25,
      updatedAt: Date.now(),
    },
    muffinBatter: {
      id: newId(),
      name: "Muffin",
      unit: "pc" as const,
      stockQty: 50,
      reorderLevel: 10,
      costPerUnit: 22,
      updatedAt: Date.now(),
    },
  };
  const ingredients: Ingredient[] = Object.values(ing);
  await db.ingredients.bulkAdd(ingredients);

  // ---- Modifier Groups ----
  const milkOptions: ModifierGroup = {
    id: newId(),
    name: "Milk Options",
    min: 0,
    max: 1,
    required: false,
    options: [
      { id: newId(), name: "Regular Milk", priceDelta: 0, recipe: [] },
      {
        id: newId(),
        name: "Oat Milk",
        priceDelta: 30,
        recipe: [{ ingredientId: ing.milk.id, qty: 50 }],
      },
      {
        id: newId(),
        name: "Almond Milk",
        priceDelta: 30,
        recipe: [{ ingredientId: ing.milk.id, qty: 50 }],
      },
    ],
  };
  const addOns: ModifierGroup = {
    id: newId(),
    name: "Add-ons",
    min: 0,
    max: 3,
    required: false,
    options: [
      {
        id: newId(),
        name: "Extra Shot",
        priceDelta: 40,
        recipe: [{ ingredientId: ing.espresso.id, qty: 18 }],
      },
      {
        id: newId(),
        name: "Cream Cheese Foam",
        priceDelta: 35,
        recipe: [{ ingredientId: ing.creamCheese.id, qty: 50 }],
      },
      {
        id: newId(),
        name: "Extra Syrup",
        priceDelta: 15,
        recipe: [{ ingredientId: ing.sugar.id, qty: 15 }],
      },
    ],
  };
  const sweetness: ModifierGroup = {
    id: newId(),
    name: "Sweetness Level",
    min: 1,
    max: 1,
    required: true,
    options: [
      { id: newId(), name: "100% Sweet", priceDelta: 0, recipe: [] },
      { id: newId(), name: "50% Sweet", priceDelta: 0, recipe: [] },
      { id: newId(), name: "No Sugar", priceDelta: 0, recipe: [] },
    ],
  };
  await db.modifierGroups.bulkAdd([milkOptions, addOns, sweetness]);

  // ---- Products ----
  const sizeVariants = (
    cup12Delta: number,
    cup16Delta: number,
    baseCupId: string,
    upgradeCupId: string
  ) => [
    {
      id: newId(),
      name: "12oz",
      priceDelta: cup12Delta,
      recipe: [{ ingredientId: baseCupId, qty: 1 }],
    },
    {
      id: newId(),
      name: "16oz",
      priceDelta: cup16Delta,
      recipe: [{ ingredientId: upgradeCupId, qty: 1 }],
    },
  ];

  const products: Product[] = [
    {
      id: newId(),
      name: "Americano",
      categoryId: catCoffee.id,
      basePrice: 99,
      active: true,
      recipe: [
        { ingredientId: ing.espresso.id, qty: 18 },
        { ingredientId: ing.water.id, qty: 150 },
      ],
      variants: sizeVariants(0, 20, ing.cup12.id, ing.cup16.id),
      modifierGroupIds: [addOns.id, sweetness.id],
      sortOrder: 0,
    },
    {
      id: newId(),
      name: "Cafe Latte",
      categoryId: catCoffee.id,
      basePrice: 119,
      active: true,
      recipe: [
        { ingredientId: ing.espresso.id, qty: 18 },
        { ingredientId: ing.milk.id, qty: 150 },
      ],
      variants: sizeVariants(0, 20, ing.cup12.id, ing.cup16.id),
      modifierGroupIds: [milkOptions.id, addOns.id, sweetness.id],
      sortOrder: 1,
    },
    {
      id: newId(),
      name: "Cappuccino",
      categoryId: catCoffee.id,
      basePrice: 119,
      active: true,
      recipe: [
        { ingredientId: ing.espresso.id, qty: 18 },
        { ingredientId: ing.milk.id, qty: 100 },
      ],
      variants: sizeVariants(0, 20, ing.cup12.id, ing.cup16.id),
      modifierGroupIds: [milkOptions.id, addOns.id, sweetness.id],
      sortOrder: 2,
    },
    {
      id: newId(),
      name: "Spanish Latte",
      categoryId: catCoffee.id,
      basePrice: 129,
      active: true,
      recipe: [
        { ingredientId: ing.espresso.id, qty: 18 },
        { ingredientId: ing.milk.id, qty: 130 },
        { ingredientId: ing.sugar.id, qty: 20 },
      ],
      variants: sizeVariants(0, 20, ing.cup12.id, ing.cup16.id),
      modifierGroupIds: [addOns.id],
      sortOrder: 3,
    },
    {
      id: newId(),
      name: "Salted Caramel Cream Latte",
      categoryId: catCoffee.id,
      basePrice: 149,
      active: true,
      recipe: [
        { ingredientId: ing.espresso.id, qty: 18 },
        { ingredientId: ing.milk.id, qty: 120 },
        { ingredientId: ing.creamCheese.id, qty: 50 },
      ],
      variants: sizeVariants(0, 20, ing.cup12.id, ing.cup16.id),
      modifierGroupIds: [addOns.id],
      sortOrder: 4,
    },
    {
      id: newId(),
      name: "Matcha Latte",
      categoryId: catNonCoffee.id,
      basePrice: 139,
      active: true,
      recipe: [
        { ingredientId: ing.matchaPowder.id, qty: 15 },
        { ingredientId: ing.milk.id, qty: 150 },
      ],
      variants: sizeVariants(0, 20, ing.cup12.id, ing.cup16.id),
      modifierGroupIds: [milkOptions.id, sweetness.id],
      sortOrder: 0,
    },
    {
      id: newId(),
      name: "Chocolate Drink",
      categoryId: catNonCoffee.id,
      basePrice: 129,
      active: true,
      recipe: [
        { ingredientId: ing.chocolate.id, qty: 40 },
        { ingredientId: ing.milk.id, qty: 150 },
      ],
      variants: sizeVariants(0, 20, ing.cup12.id, ing.cup16.id),
      modifierGroupIds: [milkOptions.id, sweetness.id],
      sortOrder: 1,
    },
    {
      id: newId(),
      name: "Butter Croissant",
      categoryId: catPastries.id,
      basePrice: 89,
      active: true,
      recipe: [{ ingredientId: ing.croissantDough.id, qty: 1 }],
      variants: [],
      modifierGroupIds: [],
      sortOrder: 0,
    },
    {
      id: newId(),
      name: "Blueberry Muffin",
      categoryId: catPastries.id,
      basePrice: 79,
      active: true,
      recipe: [{ ingredientId: ing.muffinBatter.id, qty: 1 }],
      variants: [],
      modifierGroupIds: [],
      sortOrder: 1,
    },
  ];
  await db.products.bulkAdd(products);

  // ---- Discounts ----
  const discounts: Discount[] = [
    {
      id: newId(),
      name: "Senior Citizen",
      type: "percent",
      value: 20,
      requiresApproval: true,
      active: true,
    },
    {
      id: newId(),
      name: "PWD",
      type: "percent",
      value: 20,
      requiresApproval: true,
      active: true,
    },
    {
      id: newId(),
      name: "Employee Discount",
      type: "percent",
      value: 10,
      requiresApproval: false,
      active: true,
    },
    {
      id: newId(),
      name: "₱20 Off Promo",
      type: "fixed",
      value: 20,
      requiresApproval: false,
      active: true,
    },
  ];
  await db.discounts.bulkAdd(discounts);

  // ---- Supplier ----
  await db.suppliers.add({
    id: newId(),
    name: "Local Coffee Supply Co.",
    contactPerson: "Supplier Contact",
    phone: "",
    email: "",
    address: "",
  });
}
