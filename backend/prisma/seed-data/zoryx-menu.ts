// Demo bakery menu for the Zoryx demo instance (dummy data — cakes, pastries and sweets).
// Same shape as the original seed so prisma/seed.ts needs no changes.
//
// Money: whole PKR rupees, no decimals.
// `price: null` / a variant with `price: null` means "not sellable standalone".

export interface VariantSeed {
  label: string;
  price: number | null;
}

export interface ItemSeed {
  slug: string;
  name: string;
  category: string;
  // Exactly one of these two is set: `price` for a single-price item (no sizes),
  // `variants` for a sized item.
  price?: number | null;
  variants?: VariantSeed[];
}

export interface AddOnSeed {
  name: string;
  // Scopes which items can take this add-on — matters because add-on prices are keyed
  // by size label alone, and labels aren't unique across categories (e.g. Fries has a
  // "Large" too). Without this, "Extra Cheese" priced for pizza's "Large" would also be
  // offered on a Large Fries.
  category: string;
  prices: { size: string; price: number }[];
}

export type DealComponentSeed =
  // A fixed component with no size at all, e.g. "2x Zinger Burger".
  | { kind: "item"; slug: string; quantity: number; note?: string }
  // A fixed component at one specific size, e.g. "1x Chicken Boti Shawarma, size S".
  | { kind: "variant"; slug: string; variantLabel: string; quantity: number; note?: string }
  // A choice slot, e.g. "1x any Pizza variant sized Small". allowedSlugs empty/omitted = any item.
  | { kind: "choice"; category: string; size: string; quantity: number; allowedSlugs?: string[]; note?: string };

export interface DealSeed {
  code: string;
  name: string;
  price: number;
  components: DealComponentSeed[];
}

export const CATEGORIES = ["Cakes", "Pastries", "Cookies & Brownies", "Sweets", "Breads", "Drinks"] as const;

export const CAKE_SIZES = ["1 lb", "2 lb", "3 lb"] as const;

export const ITEMS: ItemSeed[] = [
  // ===== Cakes (sized) =====
  { slug: "chocolate-fudge-cake", name: "Chocolate Fudge Cake", category: "Cakes", variants: [{ label: "1 lb", price: 1800 }, { label: "2 lb", price: 3400 }, { label: "3 lb", price: 4900 }] },
  { slug: "red-velvet-cake", name: "Red Velvet Cake", category: "Cakes", variants: [{ label: "1 lb", price: 2000 }, { label: "2 lb", price: 3800 }, { label: "3 lb", price: 5400 }] },
  { slug: "vanilla-berry-cake", name: "Vanilla Berry Cake", category: "Cakes", variants: [{ label: "1 lb", price: 1700 }, { label: "2 lb", price: 3200 }, { label: "3 lb", price: 4600 }] },
  { slug: "black-forest-cake", name: "Black Forest Cake", category: "Cakes", variants: [{ label: "1 lb", price: 1900 }, { label: "2 lb", price: 3600 }, { label: "3 lb", price: 5100 }] },
  { slug: "pineapple-cake", name: "Pineapple Cake", category: "Cakes", variants: [{ label: "1 lb", price: 1600 }, { label: "2 lb", price: 3000 }, { label: "3 lb", price: 4300 }] },
  { slug: "zoryx-special-cake", name: "Zoryx Special Cake", category: "Cakes", variants: [{ label: "1 lb", price: 2400 }, { label: "2 lb", price: 4600 }, { label: "3 lb", price: 6600 }] },

  // ===== Pastries (single price) =====
  { slug: "chocolate-pastry", name: "Chocolate Pastry", category: "Pastries", price: 280 },
  { slug: "black-forest-pastry", name: "Black Forest Pastry", category: "Pastries", price: 300 },
  { slug: "red-velvet-pastry", name: "Red Velvet Pastry", category: "Pastries", price: 340 },
  { slug: "strawberry-pastry", name: "Strawberry Pastry", category: "Pastries", price: 300 },
  { slug: "pineapple-pastry", name: "Pineapple Pastry", category: "Pastries", price: 260 },
  { slug: "tiramisu-cup", name: "Tiramisu Cup", category: "Pastries", price: 420 },
  { slug: "cheesecake-slice", name: "Cheesecake Slice", category: "Pastries", price: 450 },

  // ===== Cookies & Brownies =====
  { slug: "chocolate-chip-cookie", name: "Chocolate Chip Cookie", category: "Cookies & Brownies", price: 120 },
  { slug: "oatmeal-cookie", name: "Oatmeal Cookie", category: "Cookies & Brownies", price: 110 },
  { slug: "fudge-brownie", name: "Fudge Brownie", category: "Cookies & Brownies", price: 220 },
  { slug: "walnut-brownie", name: "Walnut Brownie", category: "Cookies & Brownies", price: 260 },
  { slug: "cookie-box", name: "Cookie Box (6 pcs)", category: "Cookies & Brownies", price: 650 },

  // ===== Sweets =====
  { slug: "gulab-jamun", name: "Gulab Jamun", category: "Sweets", variants: [{ label: "Half kg", price: 700 }, { label: "1 kg", price: 1300 }] },
  { slug: "rasmalai", name: "Rasmalai", category: "Sweets", variants: [{ label: "6 pcs", price: 900 }, { label: "12 pcs", price: 1700 }] },
  { slug: "kheer-cup", name: "Kheer Cup", category: "Sweets", price: 250 },
  { slug: "jalebi", name: "Jalebi", category: "Sweets", variants: [{ label: "Half kg", price: 600 }, { label: "1 kg", price: 1100 }] },
  { slug: "barfi-box", name: "Barfi Box", category: "Sweets", price: 800 },
  { slug: "mithai-box", name: "Assorted Mithai Box", category: "Sweets", price: 1500 },

  // ===== Breads =====
  { slug: "croissant", name: "Butter Croissant", category: "Breads", price: 220 },
  { slug: "cinnamon-roll", name: "Cinnamon Roll", category: "Breads", price: 300 },
  { slug: "garlic-bread", name: "Garlic Bread", category: "Breads", price: 250 },
  { slug: "milk-bread", name: "Milk Bread Loaf", category: "Breads", price: 280 },

  // ===== Drinks =====
  { slug: "hot-chocolate", name: "Hot Chocolate", category: "Drinks", price: 350 },
  { slug: "cappuccino", name: "Cappuccino", category: "Drinks", price: 380 },
  { slug: "iced-latte", name: "Iced Latte", category: "Drinks", price: 420 },
  { slug: "doodh-patti", name: "Doodh Patti Chai", category: "Drinks", price: 150 },
  { slug: "fresh-lime", name: "Fresh Lime", category: "Drinks", price: 200 },
  { slug: "bottled-water", name: "Bottled Water", category: "Drinks", price: 80 },
];

export const ADD_ONS: AddOnSeed[] = [
  {
    name: "Extra Chocolate Drizzle",
    category: "Cakes",
    prices: [
      { size: "1 lb", price: 150 },
      { size: "2 lb", price: 250 },
      { size: "3 lb", price: 350 },
    ],
  },
  {
    name: "Fresh Fruit Topping",
    category: "Cakes",
    prices: [
      { size: "1 lb", price: 250 },
      { size: "2 lb", price: 400 },
      { size: "3 lb", price: 550 },
    ],
  },
];

export const DEALS: DealSeed[] = [
  {
    code: "DEAL-01",
    name: "Coffee & Pastry",
    price: 600,
    components: [
      { kind: "item", slug: "cappuccino", quantity: 1 },
      { kind: "item", slug: "chocolate-pastry", quantity: 1 },
    ],
  },
  {
    code: "DEAL-02",
    name: "Tea Time",
    price: 520,
    components: [
      { kind: "item", slug: "doodh-patti", quantity: 2 },
      { kind: "item", slug: "chocolate-chip-cookie", quantity: 2 },
    ],
  },
  {
    code: "DEAL-03",
    name: "Sweet Duo",
    price: 700,
    components: [
      { kind: "item", slug: "cheesecake-slice", quantity: 1 },
      { kind: "item", slug: "fudge-brownie", quantity: 1 },
    ],
  },
  {
    code: "DEAL-04",
    name: "Celebration Cake",
    price: 2300,
    components: [
      { kind: "variant", slug: "chocolate-fudge-cake", variantLabel: "1 lb", quantity: 1 },
      { kind: "item", slug: "bottled-water", quantity: 2 },
      { kind: "item", slug: "cookie-box", quantity: 1 },
    ],
  },
  {
    code: "DEAL-05",
    name: "Pastry Pick (any 2)",
    price: 520,
    components: [{ kind: "item", slug: "chocolate-pastry", quantity: 1 }, { kind: "item", slug: "strawberry-pastry", quantity: 1 }],
  },
];
