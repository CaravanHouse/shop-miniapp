export type CategoryId = "bouquets" | "single" | "compositions" | "gifts";
export interface Product { id: string; name: string; desc: string; price: number; cat: CategoryId; emoji: string; hue: number }

export const CATEGORIES: { id: CategoryId; title: string }[] = [
  { id: "bouquets", title: "Букеты" },
  { id: "single", title: "Поштучно" },
  { id: "compositions", title: "Композиции" },
  { id: "gifts", title: "Подарки" },
];

// Демо-каталог цветочного магазина. Замените на данные клиента (позже — из базы или админки).
export const PRODUCTS: Product[] = [
  { id: "b1", cat: "bouquets", name: "Нежность", desc: "Кустовые розы и эустома, 15 цветов", price: 280_000, emoji: "🌸", hue: 340 },
  { id: "b2", cat: "bouquets", name: "Рассвет в Ташкенте", desc: "Тюльпаны в тёплых оттенках, 25 штук", price: 340_000, emoji: "🌷", hue: 20 },
  { id: "b3", cat: "bouquets", name: "Подсолнечное лето", desc: "Подсолнухи с зеленью, 7 штук", price: 260_000, emoji: "🌻", hue: 48 },
  { id: "b4", cat: "bouquets", name: "Белое облако", desc: "Пионовидные розы и гипсофила", price: 420_000, emoji: "💐", hue: 200 },
  { id: "b5", cat: "bouquets", name: "Красная нота", desc: "Эквадорская роза, 21 цветок", price: 520_000, emoji: "🌹", hue: 355 },
  { id: "s1", cat: "single", name: "Роза Эквадор", desc: "Стебель 60 см", price: 35_000, emoji: "🌹", hue: 350 },
  { id: "s2", cat: "single", name: "Тюльпан", desc: "Голландский, свежий срез", price: 18_000, emoji: "🌷", hue: 330 },
  { id: "s3", cat: "single", name: "Подсолнух", desc: "Крупный, с длинным стеблем", price: 25_000, emoji: "🌻", hue: 45 },
  { id: "s4", cat: "single", name: "Гортензия", desc: "Пышное соцветие, сиреневая", price: 60_000, emoji: "🪻", hue: 270 },
  { id: "c1", cat: "compositions", name: "Коробка «Утро»", desc: "Цветы в шляпной коробке", price: 380_000, emoji: "🌼", hue: 55 },
  { id: "c2", cat: "compositions", name: "Корзина «Сад»", desc: "Сезонные цветы и зелень", price: 450_000, emoji: "🌿", hue: 140 },
  { id: "g1", cat: "gifts", name: "Свеча «Пион»", desc: "Соевая, 40 часов горения", price: 95_000, emoji: "🕯️", hue: 25 },
  { id: "g2", cat: "gifts", name: "Открытка", desc: "Ручная работа, с вашим текстом", price: 25_000, emoji: "💌", hue: 320 },
  { id: "g3", cat: "gifts", name: "Шоколад", desc: "Плитка тёмного шоколада", price: 55_000, emoji: "🍫", hue: 30 },
];

export const DELIVERY_FEE = 25_000;
export const FREE_DELIVERY_FROM = 400_000;

export const money = (n: number) => `${n.toLocaleString("ru-RU")} сум`;
export const productById = (id: string) => PRODUCTS.find((p) => p.id === id);

export interface CartLine { id: string; qty: number }

/** Единая формула суммы: и клиент, и сервер считают одинаково (серверу верим только свою) */
export function totals(lines: CartLine[], pickup: boolean) {
  const subtotal = lines.reduce((s, l) => s + (productById(l.id)?.price ?? 0) * l.qty, 0);
  const delivery = pickup || subtotal === 0 || subtotal >= FREE_DELIVERY_FROM ? 0 : DELIVERY_FEE;
  return { subtotal, delivery, total: subtotal + delivery };
}
