// The demo business: "Scoops & Slices Café", an ice cream café with a bakery in Islamabad. Everything
// here is fictional — names, phone numbers (0300 1234567 style), account numbers. Money is whole PKR.

export const DEMO_PASSWORD = "demo1234";

export const SHOP = {
  shopNameEn: "Scoops & Slices Café",
  shopNameUr: "اسکوپس اینڈ سلائسز کیفے",
  taglineEn: "Hand-churned ice cream and fresh-baked cakes, every day",
  taglineUr: "ہاتھ سے بنی آئس کریم اور تازہ کیک، ہر روز",
  phone: "0300 1234567",
  whatsappNumber: "923001234567",
  addressEn: "Shop 12, Gulberg Arcade, Sector F-7 Markaz, Islamabad",
  addressUr: "دکان نمبر 12، گلبرگ آرکیڈ، ایف سیون مرکز، اسلام آباد",
  mapUrl: "https://maps.google.com/?q=F-7+Markaz+Islamabad",
  openingHoursEn: "Every day, 12:00 pm – 1:00 am",
  openingHoursUr: "ہر روز، دوپہر 12 بجے سے رات 1 بجے تک",
  announcementEn: "Winter special: Hot Fudge Brownie Sundae",
  announcementUr: "سردیوں کا خاص: ہاٹ فج براؤنی سنڈے",
  instagramUrl: "https://instagram.com/scoopsandslices.demo",
  facebookUrl: "https://facebook.com/scoopsandslices.demo",
};

export type KitchenKey = "SCOOP" | "BAKERY" | "BAR";

export const KITCHENS: Record<KitchenKey, string> = {
  SCOOP: "Scoop Counter",
  BAKERY: "Bakery & Cakes",
  BAR: "Chai & Shakes Bar",
};

// What drives the order mix (see history.ts): how often a line comes from each group, in winter.
export type DemandGroup = "scoops" | "sundaes" | "desi" | "shakes" | "chai" | "coffee" | "cakes" | "slices" | "bakes" | "savoury";

export interface CategorySeed {
  key: string;
  name: string;
  nameUr: string;
}

export const CATEGORIES: CategorySeed[] = [
  { key: "scoops", name: "Ice Cream Scoops", nameUr: "آئس کریم اسکوپس" },
  { key: "sundaes", name: "Sundaes", nameUr: "سنڈیز" },
  { key: "desi", name: "Desi Delights", nameUr: "دیسی میٹھے" },
  { key: "shakes", name: "Shakes", nameUr: "شیکس" },
  { key: "chai", name: "Chai & Coffee", nameUr: "چائے اور کافی" },
  { key: "cakes", name: "Cakes", nameUr: "کیکس" },
  { key: "slices", name: "Slices & Pastries", nameUr: "سلائسز اور پیسٹریز" },
  { key: "bakes", name: "Bakes & Snacks", nameUr: "بیکری اور اسنیکس" },
];

export interface ItemSeed {
  key: string;
  name: string;
  nameUr: string;
  description: string;
  category: string;
  kitchen: KitchenKey;
  group: DemandGroup;
  price?: number;
  variants?: [label: string, price: number][];
  openPrice?: { min: number; max: number };
  featured?: boolean;
  hiddenOnline?: boolean;
  // Only ever inside a deal (no price of its own, not sold alone).
  dealOnly?: boolean;
}

const SCOOP_SIZES: [string, number][] = [
  ["Single", 350],
  ["Double", 600],
  ["Triple", 850],
];

function scoop(key: string, name: string, nameUr: string, description: string, featured = false): ItemSeed {
  return { key, name, nameUr, description, category: "scoops", kitchen: "SCOOP", group: "scoops", variants: SCOOP_SIZES, featured };
}

function shake(key: string, name: string, nameUr: string, regular: number, large: number, featured = false): ItemSeed {
  return {
    key,
    name,
    nameUr,
    description: "Thick, blended with our own ice cream.",
    category: "shakes",
    kitchen: "BAR",
    group: "shakes",
    variants: [
      ["Regular", regular],
      ["Large", large],
    ],
    featured,
  };
}

function cake(key: string, name: string, nameUr: string, onePound: number, twoPound: number, featured = false): ItemSeed {
  return {
    key,
    name,
    nameUr,
    description: "Baked fresh every morning. Order a 2 lb a day ahead for a message on top.",
    category: "cakes",
    kitchen: "BAKERY",
    group: "cakes",
    variants: [
      ["1 lb", onePound],
      ["2 lb", twoPound],
    ],
    featured,
  };
}

export const ITEMS: ItemSeed[] = [
  scoop("vanilla", "Vanilla Ice Cream", "ونیلا آئس کریم", "Madagascar-style vanilla, the classic."),
  scoop("chocolate", "Chocolate Ice Cream", "چاکلیٹ آئس کریم", "Rich dark cocoa."),
  scoop("strawberry", "Strawberry Ice Cream", "اسٹرابیری آئس کریم", "Made with Swat strawberries."),
  scoop("mango", "Mango Ice Cream", "مینگو آئس کریم", "Sindhri mango pulp, all year round."),
  scoop("pista", "Pista Ice Cream", "پستہ آئس کریم", "Roasted pistachio, lots of it."),
  scoop("kulfi", "Kulfi Ice Cream", "قلفی آئس کریم", "Slow-cooked milk, elaichi and kewra."),
  scoop("tutti", "Tutti Frutti Ice Cream", "ٹوٹی فروٹی آئس کریم", "Candied fruit bits in vanilla."),
  scoop("coffee-scoop", "Coffee Ice Cream", "کافی آئس کریم", "Espresso-strong."),
  scoop("lotus", "Lotus Biscoff Ice Cream", "لوٹس بسکوف آئس کریم", "Biscoff spread swirled through.", true),
  scoop("cookies-cream", "Cookies & Cream Ice Cream", "کوکیز اینڈ کریم آئس کریم", "Crushed chocolate cookies."),
  scoop("salted-caramel", "Salted Caramel Ice Cream", "سالٹڈ کیریمل آئس کریم", "Burnt sugar and sea salt."),
  {
    key: "bucket-scoop",
    name: "Double Scoop (Bucket)",
    nameUr: "ڈبل اسکوپ (بکٹ)",
    description: "Part of the Family Scoop Bucket — any flavour.",
    category: "scoops",
    kitchen: "SCOOP",
    group: "scoops",
    dealOnly: true,
    hiddenOnline: true,
  },

  { key: "hot-fudge", name: "Hot Fudge Brownie Sundae", nameUr: "ہاٹ فج براؤنی سنڈے", description: "Warm brownie, vanilla, hot fudge, nuts. Our winter special.", category: "sundaes", kitchen: "SCOOP", group: "sundaes", price: 950, featured: true },
  { key: "banana-split", name: "Banana Split", nameUr: "بنانا اسپلٹ", description: "Three scoops, banana, sauces and cream.", category: "sundaes", kitchen: "SCOOP", group: "sundaes", price: 850 },
  { key: "lotus-sundae", name: "Lotus Sundae", nameUr: "لوٹس سنڈے", description: "Lotus ice cream, Biscoff crumbs, warm spread.", category: "sundaes", kitchen: "SCOOP", group: "sundaes", price: 990 },
  { key: "waffle-ice-cream", name: "Waffle with Ice Cream", nameUr: "وافل آئس کریم کے ساتھ", description: "Fresh Belgian waffle, two scoops, chocolate sauce.", category: "sundaes", kitchen: "SCOOP", group: "sundaes", price: 750 },

  { key: "matka-kulfi", name: "Matka Kulfi", nameUr: "مٹکا قلفی", description: "Set in a clay pot, topped with pista.", category: "desi", kitchen: "SCOOP", group: "desi", price: 400 },
  { key: "falooda", name: "Falooda", nameUr: "فالودہ", description: "Rose milk, sevaiyan, tukh malanga and kulfi.", category: "desi", kitchen: "SCOOP", group: "desi", price: 550, featured: true },
  { key: "kulfa-rabri", name: "Kulfa Rabri", nameUr: "قلفہ ربڑی", description: "Kulfa slices under thick rabri.", category: "desi", kitchen: "SCOOP", group: "desi", price: 500 },
  { key: "gajar-halwa", name: "Gajar Halwa with Ice Cream", nameUr: "گاجر کا حلوہ آئس کریم کے ساتھ", description: "Warm winter gajar halwa with a vanilla scoop.", category: "desi", kitchen: "SCOOP", group: "desi", price: 650 },

  shake("choc-shake", "Chocolate Shake", "چاکلیٹ شیک", 650, 850),
  shake("oreo-shake", "Oreo Shake", "اوریو شیک", 700, 900, true),
  shake("mango-shake", "Mango Shake", "مینگو شیک", 650, 850),
  shake("lotus-shake", "Lotus Shake", "لوٹس شیک", 800, 1000),
  shake("strawberry-shake", "Strawberry Shake", "اسٹرابیری شیک", 650, 850),
  shake("cold-coffee", "Cold Coffee", "کولڈ کافی", 550, 750),

  { key: "doodh-patti", name: "Doodh Patti", nameUr: "دودھ پتی", description: "Strong, milky, the way Pindi likes it.", category: "chai", kitchen: "BAR", group: "chai", price: 180 },
  { key: "kashmiri-chai", name: "Kashmiri Chai", nameUr: "کشمیری چائے", description: "Pink chai with pista and almonds.", category: "chai", kitchen: "BAR", group: "chai", price: 300, featured: true },
  { key: "green-tea", name: "Green Tea", nameUr: "سبز چائے", description: "Light, with a slice of lemon.", category: "chai", kitchen: "BAR", group: "chai", price: 200, hiddenOnline: true },
  { key: "cappuccino", name: "Cappuccino", nameUr: "کیپوچینو", description: "Double shot, thick foam.", category: "chai", kitchen: "BAR", group: "coffee", price: 550 },
  { key: "latte", name: "Latte", nameUr: "لاٹے", description: "Double shot, silky milk.", category: "chai", kitchen: "BAR", group: "coffee", price: 550 },
  { key: "iced-latte", name: "Iced Latte", nameUr: "آئسڈ لاٹے", description: "Over ice.", category: "chai", kitchen: "BAR", group: "coffee", price: 650 },
  { key: "hot-chocolate", name: "Hot Chocolate", nameUr: "ہاٹ چاکلیٹ", description: "Melted chocolate and whipped cream.", category: "chai", kitchen: "BAR", group: "coffee", price: 600 },

  cake("choc-fudge-cake", "Chocolate Fudge Cake", "چاکلیٹ فج کیک", 1800, 3400, true),
  cake("red-velvet", "Red Velvet Cake", "ریڈ ویلویٹ کیک", 2000, 3800),
  cake("black-forest", "Black Forest Cake", "بلیک فاریسٹ کیک", 1700, 3200),
  cake("pineapple-cake", "Pineapple Cake", "پائن ایپل کیک", 1500, 2800),
  cake("lotus-cake", "Lotus Cake", "لوٹس کیک", 2200, 4200),
  {
    key: "custom-cake",
    name: "Custom Celebration Cake",
    nameUr: "کسٹم سیلیبریشن کیک",
    description: "Designed with you at the counter — price agreed on the order.",
    category: "cakes",
    kitchen: "BAKERY",
    group: "cakes",
    openPrice: { min: 2000, max: 15000 },
    hiddenOnline: true,
  },
  {
    key: "birthday-cake",
    name: "Birthday Cake 2 lb",
    nameUr: "برتھ ڈے کیک 2 پاؤنڈ",
    description: "Part of the Birthday Deal.",
    category: "cakes",
    kitchen: "BAKERY",
    group: "cakes",
    dealOnly: true,
    hiddenOnline: true,
  },

  { key: "choc-pastry", name: "Chocolate Pastry", nameUr: "چاکلیٹ پیسٹری", description: "Layered sponge and ganache.", category: "slices", kitchen: "BAKERY", group: "slices", price: 350 },
  { key: "pineapple-pastry", name: "Pineapple Pastry", nameUr: "پائن ایپل پیسٹری", description: "Light cream and pineapple.", category: "slices", kitchen: "BAKERY", group: "slices", price: 300 },
  { key: "bf-pastry", name: "Black Forest Pastry", nameUr: "بلیک فاریسٹ پیسٹری", description: "Cherries, cream, chocolate shavings.", category: "slices", kitchen: "BAKERY", group: "slices", price: 350 },
  { key: "coffee-pastry", name: "Coffee Pastry", nameUr: "کافی پیسٹری", description: "Mocha cream sponge.", category: "slices", kitchen: "BAKERY", group: "slices", price: 350 },
  { key: "blueberry-cheesecake", name: "Blueberry Cheesecake", nameUr: "بلیو بیری چیز کیک", description: "Baked New York style, one slice.", category: "slices", kitchen: "BAKERY", group: "slices", price: 750 },
  { key: "lotus-cheesecake", name: "Lotus Cheesecake", nameUr: "لوٹس چیز کیک", description: "Biscoff base and topping, one slice.", category: "slices", kitchen: "BAKERY", group: "slices", price: 800, featured: true },
  { key: "tiramisu", name: "Tiramisu Cup", nameUr: "تیرامیسو کپ", description: "Coffee-soaked sponge, mascarpone cream.", category: "slices", kitchen: "BAKERY", group: "slices", price: 650 },
  { key: "lava-cake", name: "Chocolate Lava Cake", nameUr: "چاکلیٹ لاوا کیک", description: "Served warm with a vanilla scoop.", category: "slices", kitchen: "BAKERY", group: "slices", price: 700 },

  { key: "fudge-brownie", name: "Fudge Brownie", nameUr: "فج براؤنی", description: "Dense, gooey, walnut-topped.", category: "bakes", kitchen: "BAKERY", group: "bakes", price: 350, featured: true },
  { key: "choc-chip-cookie", name: "Chocolate Chip Cookie", nameUr: "چاکلیٹ چپ کوکی", description: "Crisp edges, soft middle.", category: "bakes", kitchen: "BAKERY", group: "bakes", price: 200 },
  { key: "nutella-cookie", name: "Nutella Cookie", nameUr: "نیوٹیلا کوکی", description: "Stuffed with Nutella.", category: "bakes", kitchen: "BAKERY", group: "bakes", price: 300 },
  { key: "vanilla-cupcake", name: "Vanilla Cupcake", nameUr: "ونیلا کپ کیک", description: "Buttercream swirl and sprinkles.", category: "bakes", kitchen: "BAKERY", group: "bakes", price: 250 },
  { key: "choc-cupcake", name: "Chocolate Cupcake", nameUr: "چاکلیٹ کپ کیک", description: "Chocolate on chocolate.", category: "bakes", kitchen: "BAKERY", group: "bakes", price: 280 },
  { key: "cream-roll", name: "Cream Roll", nameUr: "کریم رول", description: "Flaky pastry, fresh cream.", category: "bakes", kitchen: "BAKERY", group: "bakes", price: 150, hiddenOnline: true },
  { key: "croissant", name: "Croissant", nameUr: "کروسان", description: "All butter.", category: "bakes", kitchen: "BAKERY", group: "bakes", price: 350 },
  { key: "choc-croissant", name: "Chocolate Croissant", nameUr: "چاکلیٹ کروسان", description: "With a dark chocolate bar inside.", category: "bakes", kitchen: "BAKERY", group: "bakes", price: 400 },
  { key: "chicken-patty", name: "Chicken Patty", nameUr: "چکن پیٹیز", description: "Puff pastry, spiced chicken filling.", category: "bakes", kitchen: "BAKERY", group: "savoury", price: 220 },
  { key: "chicken-sandwich", name: "Chicken Cheese Sandwich", nameUr: "چکن چیز سینڈوچ", description: "Grilled, with fries on the side.", category: "bakes", kitchen: "BAKERY", group: "savoury", price: 550 },
  { key: "fries", name: "Fries", nameUr: "فرائز", description: "Crisp, with ketchup and garlic mayo.", category: "bakes", kitchen: "BAKERY", group: "savoury", price: 350 },
];

// Add-ons for the scoops, priced per size.
export const ADD_ONS: { name: string; prices: [size: string, price: number][] }[] = [
  { name: "Waffle Cone", prices: [["Single", 100], ["Double", 120], ["Triple", 150]] },
  { name: "Chocolate Sauce", prices: [["Single", 80], ["Double", 100], ["Triple", 120]] },
  { name: "Sprinkles", prices: [["Single", 50], ["Double", 60], ["Triple", 70]] },
  { name: "Nutella", prices: [["Single", 150], ["Double", 200], ["Triple", 250]] },
  { name: "Lotus Crumbs", prices: [["Single", 120], ["Double", 150], ["Triple", 180]] },
  { name: "Brownie Chunks", prices: [["Single", 150], ["Double", 180], ["Triple", 220]] },
  { name: "Whipped Cream", prices: [["Single", 80], ["Double", 100], ["Triple", 120]] },
];

export interface DealSeed {
  code: string;
  name: string;
  nameUr: string;
  description: string;
  price: number;
  items: [itemKey: string, quantity: number][];
  featured?: boolean;
}

export const DEALS: DealSeed[] = [
  { code: "FAMILY-BUCKET", name: "Family Scoop Bucket", nameUr: "فیملی اسکوپ بکٹ", description: "Four double scoops, any flavours — share with the family.", price: 2200, items: [["bucket-scoop", 4]], featured: true },
  { code: "BIRTHDAY", name: "Birthday Deal", nameUr: "برتھ ڈے ڈیل", description: "A 2 lb cake and six vanilla cupcakes.", price: 4500, items: [["birthday-cake", 1], ["vanilla-cupcake", 6]] },
  { code: "CHAI-CAKE", name: "Chai & Cake", nameUr: "چائے اور کیک", description: "A doodh patti and a chocolate pastry.", price: 450, items: [["doodh-patti", 1], ["choc-pastry", 1]] },
  { code: "COUPLE-SUNDAE", name: "Couple Sundae Deal", nameUr: "کپل سنڈے ڈیل", description: "A Hot Fudge Brownie Sundae and a Lotus Sundae.", price: 1750, items: [["hot-fudge", 1], ["lotus-sundae", 1]] },
];

// Dining areas: [name, section, capacity].
export const DINING_AREAS: [name: string, area: string, capacity: number][] = [
  ...[1, 2, 3, 4, 5, 6].map((n): [string, string, number] => [`F${n}`, "Family Hall", n <= 2 ? 6 : 4]),
  ...[1, 2, 3, 4, 5, 6].map((n): [string, string, number] => [`G${n}`, "Ground Floor", n <= 4 ? 4 : 2]),
  ...[1, 2, 3, 4].map((n): [string, string, number] => [`T${n}`, "Terrace", 4]),
];

export type StaffRoleName = "SUPER_ADMIN" | "POS_ADMIN" | "ONLINE_ADMIN" | "ORDER_TAKER" | "KITCHEN";

export interface PersonSeed {
  key: string;
  name: string;
  designation: string;
  salary: number;
  phone: string;
  joinedMonthsAgo: number;
  // A login, when they have one.
  login?: { username: string; role: StaffRoleName; kitchen?: KitchenKey };
  // The owner draws no salary and is not on payroll.
  onPayroll?: boolean;
}

export const PEOPLE: PersonSeed[] = [
  { key: "owner", name: "Ahmed Raza", designation: "Owner", salary: 0, phone: "03001234501", joinedMonthsAgo: 30, login: { username: "owner", role: "SUPER_ADMIN" }, onPayroll: false },
  { key: "manager", name: "Bilal Khan", designation: "Manager", salary: 80000, phone: "03001234502", joinedMonthsAgo: 28, login: { username: "manager", role: "POS_ADMIN" } },
  { key: "cashier", name: "Sana Iqbal", designation: "Cashier", salary: 45000, phone: "03001234503", joinedMonthsAgo: 14, login: { username: "cashier", role: "POS_ADMIN" } },
  { key: "online", name: "Ayesha Malik", designation: "Online Orders", salary: 42000, phone: "03001234504", joinedMonthsAgo: 9, login: { username: "online", role: "ONLINE_ADMIN" } },
  { key: "waiter1", name: "Usman Ali", designation: "Waiter", salary: 32000, phone: "03001234505", joinedMonthsAgo: 20, login: { username: "waiter1", role: "ORDER_TAKER" } },
  { key: "waiter2", name: "Hamza Sheikh", designation: "Waiter", salary: 30000, phone: "03001234506", joinedMonthsAgo: 11, login: { username: "waiter2", role: "ORDER_TAKER" } },
  { key: "waiter3", name: "Zainab Noor", designation: "Waiter", salary: 30000, phone: "03001234507", joinedMonthsAgo: 6, login: { username: "waiter3", role: "ORDER_TAKER" } },
  { key: "kitchen-scoop", name: "Imran Hussain", designation: "Scoop Counter Lead", salary: 40000, phone: "03001234508", joinedMonthsAgo: 26, login: { username: "scoop", role: "KITCHEN", kitchen: "SCOOP" } },
  { key: "kitchen-bakery", name: "Shahid Mehmood", designation: "Head Baker", salary: 65000, phone: "03001234509", joinedMonthsAgo: 30, login: { username: "bakery", role: "KITCHEN", kitchen: "BAKERY" } },
  { key: "kitchen-bar", name: "Nadeem Akhtar", designation: "Chai & Shakes Bar", salary: 38000, phone: "03001234510", joinedMonthsAgo: 18, login: { username: "chaibar", role: "KITCHEN", kitchen: "BAR" } },
  { key: "rider1", name: "Kashif Javed", designation: "Rider", salary: 28000, phone: "03001234511", joinedMonthsAgo: 15 },
  { key: "rider2", name: "Waqas Ahmed", designation: "Rider", salary: 28000, phone: "03001234512", joinedMonthsAgo: 5 },
  { key: "cleaner", name: "Rashid Masih", designation: "Cleaner", salary: 25000, phone: "03001234513", joinedMonthsAgo: 22 },
  { key: "baker", name: "Tariq Mehmood", designation: "Baker", salary: 45000, phone: "03001234514", joinedMonthsAgo: 12 },
];

export interface InventorySeed {
  key: string;
  name: string;
  unit: string;
  stock: number;
  min: number;
  auto: boolean;
}

// Three are below their low-stock level on purpose: Lotus spread, waffle cones, cake boxes.
export const INVENTORY: InventorySeed[] = [
  { key: "milk", name: "Milk", unit: "L", stock: 120, min: 40, auto: true },
  { key: "cream", name: "Fresh Cream", unit: "L", stock: 35, min: 10, auto: true },
  { key: "ice-cream-base", name: "Ice Cream Base", unit: "L", stock: 85, min: 30, auto: true },
  { key: "sugar", name: "Sugar", unit: "kg", stock: 60, min: 20, auto: false },
  { key: "flour", name: "Flour (Maida)", unit: "kg", stock: 75, min: 25, auto: false },
  { key: "butter", name: "Butter", unit: "kg", stock: 18, min: 6, auto: false },
  { key: "eggs", name: "Eggs", unit: "dozen", stock: 30, min: 10, auto: false },
  { key: "cocoa", name: "Cocoa Powder", unit: "kg", stock: 9, min: 3, auto: false },
  { key: "chocolate", name: "Cooking Chocolate", unit: "kg", stock: 14, min: 5, auto: false },
  { key: "mango-pulp", name: "Mango Pulp", unit: "kg", stock: 20, min: 8, auto: false },
  { key: "pistachio", name: "Pistachio", unit: "kg", stock: 4, min: 2, auto: false },
  { key: "lotus-spread", name: "Lotus Biscoff Spread", unit: "jar", stock: 3, min: 8, auto: true },
  { key: "nutella", name: "Nutella", unit: "jar", stock: 12, min: 5, auto: true },
  { key: "oreo", name: "Oreo Biscuits", unit: "pack", stock: 40, min: 15, auto: true },
  { key: "coffee-beans", name: "Coffee Beans", unit: "kg", stock: 7, min: 3, auto: true },
  { key: "tea-leaves", name: "Tea Leaves", unit: "kg", stock: 8, min: 3, auto: true },
  { key: "waffle-cones", name: "Waffle Cones", unit: "pcs", stock: 45, min: 150, auto: true },
  { key: "ice-cream-cups", name: "Ice Cream Cups", unit: "pcs", stock: 900, min: 300, auto: true },
  { key: "takeaway-cups", name: "Takeaway Cups", unit: "pcs", stock: 650, min: 250, auto: true },
  { key: "cake-boxes", name: "Cake Boxes", unit: "pcs", stock: 12, min: 40, auto: true },
  { key: "strawberries", name: "Strawberries", unit: "kg", stock: 6, min: 2, auto: false },
  { key: "bananas", name: "Bananas", unit: "dozen", stock: 8, min: 3, auto: false },
  { key: "chicken", name: "Chicken (boneless)", unit: "kg", stock: 15, min: 5, auto: false },
  { key: "cheese", name: "Cheese Slices", unit: "pack", stock: 10, min: 4, auto: false },
  { key: "potatoes", name: "Potatoes", unit: "kg", stock: 25, min: 10, auto: false },
  { key: "cream-cheese", name: "Cream Cheese", unit: "kg", stock: 6, min: 2, auto: false },
];

// Menu item -> inventory used per order line (per unit ordered).
export const INVENTORY_LINKS: [itemKey: string, inventoryKey: string, quantity: number][] = [
  ...["vanilla", "chocolate", "strawberry", "mango", "pista", "kulfi", "tutti", "coffee-scoop", "lotus", "cookies-cream", "salted-caramel", "bucket-scoop"].flatMap(
    (key): [string, string, number][] => [
      [key, "ice-cream-base", 0.15],
      [key, "ice-cream-cups", 1],
    ],
  ),
  ["lotus", "lotus-spread", 0.05],
  ["cookies-cream", "oreo", 0.2],
  ["hot-fudge", "ice-cream-base", 0.2],
  ["banana-split", "ice-cream-base", 0.3],
  ["lotus-sundae", "lotus-spread", 0.1],
  ["waffle-ice-cream", "ice-cream-base", 0.2],
  ...["choc-shake", "oreo-shake", "mango-shake", "lotus-shake", "strawberry-shake", "cold-coffee"].flatMap((key): [string, string, number][] => [
    [key, "milk", 0.3],
    [key, "takeaway-cups", 1],
  ]),
  ["oreo-shake", "oreo", 0.3],
  ["lotus-shake", "lotus-spread", 0.1],
  ["doodh-patti", "milk", 0.2],
  ["doodh-patti", "tea-leaves", 0.01],
  ["kashmiri-chai", "milk", 0.25],
  ["cappuccino", "coffee-beans", 0.02],
  ["cappuccino", "milk", 0.2],
  ["latte", "coffee-beans", 0.02],
  ["latte", "milk", 0.25],
  ["iced-latte", "coffee-beans", 0.02],
  ["hot-chocolate", "milk", 0.25],
  ...["choc-fudge-cake", "red-velvet", "black-forest", "pineapple-cake", "lotus-cake", "custom-cake", "birthday-cake"].map((key): [string, string, number] => [key, "cake-boxes", 1]),
  ["lotus-cake", "lotus-spread", 0.3],
  ["nutella-cookie", "nutella", 0.05],
];

export const VENDORS: { key: string; name: string; contact: string; phone: string; address: string; supplies: string; buyEveryDays: number; buyAmount: [number, number] }[] = [
  { key: "dairy", name: "Al-Madina Dairy Supplies", contact: "Haji Rafiq", phone: "03001230001", address: "Dhok Kala Khan, Rawalpindi", supplies: "milk and cream", buyEveryDays: 2, buyAmount: [14000, 22000] },
  { key: "packaging", name: "Pindi Packaging House", contact: "Faisal Butt", phone: "03001230002", address: "Raja Bazar, Rawalpindi", supplies: "cups, cones and cake boxes", buyEveryDays: 7, buyAmount: [18000, 32000] },
  { key: "cocoa", name: "Karachi Cocoa Traders", contact: "Salman Siddiqui", phone: "03001230003", address: "Jodia Bazar, Karachi", supplies: "chocolate, cocoa and spreads", buyEveryDays: 10, buyAmount: [35000, 60000] },
  { key: "fruit", name: "Fresh Fruit Mandi Rawalpindi", contact: "Nawaz Gujjar", phone: "03001230004", address: "Sabzi Mandi, IJP Road, Rawalpindi", supplies: "fruit and mango pulp", buyEveryDays: 3, buyAmount: [5000, 11000] },
  { key: "bakery", name: "Capital Bakery Wholesale", contact: "Kamran Qureshi", phone: "03001230005", address: "I-9 Industrial Area, Islamabad", supplies: "flour, sugar, butter and eggs", buyEveryDays: 5, buyAmount: [16000, 28000] },
];

// [nameEn, nameUr, fee, minimum order]
export const DELIVERY_AREAS: [string, string, number, number][] = [
  ["F-7", "ایف سیون", 150, 1000],
  ["F-10", "ایف ٹین", 200, 1200],
  ["G-11", "جی الیون", 250, 1500],
  ["Blue Area", "بلیو ایریا", 200, 1200],
  ["DHA Phase 2", "ڈی ایچ اے فیز ٹو", 350, 2000],
  ["Bahria Town Phase 7", "بحریہ ٹاؤن فیز سیون", 300, 2000],
];

export const PAYMENT_ACCOUNTS: { label: string; accountTitle: string; accountNumber: string }[] = [
  { label: "Easypaisa", accountTitle: "Scoops & Slices Café (DEMO)", accountNumber: "0300 0000000" },
  { label: "JazzCash", accountTitle: "Scoops & Slices Café (DEMO)", accountNumber: "0301 0000000" },
  { label: "Meezan Bank", accountTitle: "Scoops & Slices Café (DEMO)", accountNumber: "PK00 MEZN 0000 0000 0000 0000" },
];

export const TESTIMONIALS: { name: string; area: string; text: string; rating: number }[] = [
  { name: "Mehwish Tariq", area: "F-10", text: "The Lotus Sundae is unreal. We come every Friday after dinner now.", rating: 5 },
  { name: "Faraz Ahmed", area: "G-11", text: "Bhai hot fudge brownie sundae try karo, sardiyon mein maza aa jata hai!", rating: 5 },
  { name: "Ayesha Khan", area: "DHA Phase 2", text: "Ordered a custom cake for my son's birthday — exactly what we asked for, and on time.", rating: 5 },
  { name: "Hassan Raza", area: "Blue Area", text: "Kashmiri chai aur chocolate pastry, office ke baad perfect combo.", rating: 4 },
  { name: "Sadia Butt", area: "Bahria Town Phase 7", text: "Delivery was quick and the ice cream arrived properly frozen. Impressed.", rating: 5 },
  { name: "Omer Farooq", area: "F-7", text: "Falooda bilkul Lahore wala taste. Kulfa rabri bhi zabardast.", rating: 5 },
  { name: "Nida Shah", area: "F-10", text: "Cosy family hall, friendly staff, and the red velvet is the best in Islamabad.", rating: 4 },
  { name: "Ali Haider", area: "G-11", text: "Oreo shake large lo, paisa wasool. Fries bhi crispy thay.", rating: 4 },
];

export const GALLERY: { caption: string; captionUr: string }[] = [
  { caption: "Our scoop counter", captionUr: "ہمارا اسکوپ کاؤنٹر" },
  { caption: "Fresh from the oven", captionUr: "تنور سے تازہ" },
  { caption: "The family hall", captionUr: "فیملی ہال" },
  { caption: "Terrace evenings", captionUr: "ٹیرس کی شامیں" },
  { caption: "Birthday cakes, made to order", captionUr: "آرڈر پر برتھ ڈے کیک" },
  { caption: "Winter special sundae", captionUr: "سردیوں کا خاص سنڈے" },
  { caption: "Chai time", captionUr: "چائے کا وقت" },
  { caption: "Eleven flavours, churned daily", captionUr: "گیارہ ذائقے، روزانہ تازہ" },
];

export const CUSTOMER_NAMES = [
  "Ali Hassan", "Fatima Zahra", "Hira Aslam", "Imran Qureshi", "Maryam Siddiqui", "Hamza Iqbal", "Areeba Khan",
  "Saad Malik", "Noor Fatima", "Bilal Ahmed", "Mahnoor Butt", "Danish Raza", "Iqra Sheikh", "Fahad Mirza",
  "Sana Javed", "Umair Abbasi", "Kiran Shah", "Zeeshan Haider", "Rabia Anwar", "Talha Chaudhry", "Amna Rauf",
  "Usama Tariq", "Hafsa Nadeem", "Kamran Akmal", "Laiba Arshad", "Shoaib Akhtar", "Mehak Riaz", "Junaid Khan",
  "Aiman Rizvi", "Waleed Saeed", "Sobia Naz", "Arslan Ashraf", "Zara Hussain", "Haris Sohail", "Anum Shahid",
  "Faisal Nawaz", "Sidra Yousaf", "Adeel Hafeez", "Hina Pervaiz", "Raheel Abbas", "Nimra Asif", "Moiz Ali",
  "Saba Qamar", "Asad Shafiq", "Rimsha Imtiaz", "Taimoor Aslam", "Javeria Saud", "Owais Kazmi", "Maham Gillani",
  "Shahzaib Rana",
];

export const STREETS = ["Street 3", "Street 7", "Street 12", "Street 15", "Street 22", "Street 31", "Street 40", "Street 54", "Margalla Road", "School Road", "Nazim-ud-din Road", "Main Double Road"];
export const LANDMARKS = ["Near the mosque", "Opposite the park", "Behind the school", "Next to the pharmacy", "Gate 2"];

export const LINE_NOTES = ["kam meetha", "extra chocolate", "no nuts", "extra hot", "less ice", "kam cheeni", "double shot", "extra sauce", "no sprinkles", "pack separately"];
export const CAKE_NOTES = ["Write: Happy Birthday Ali", "Write: Happy Anniversary", "Write: Congratulations Hira", "Birthday candle please"];

export const CANCEL_REASONS = ["Customer left", "Wrong order", "Item finished"];
export const DISCOUNT_REASONS = ["Regular customer", "Late order", "Birthday treat", "Staff family", "Complaint — ice cream melted", "Student discount"];
