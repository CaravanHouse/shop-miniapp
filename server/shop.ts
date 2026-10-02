import { JsonDb } from "./db";
import { productById, totals } from "../shared/products";

export type OrderStatus = "new" | "accepted" | "delivering" | "done" | "canceled";
export interface OrderItem { id: string; name: string; price: number; qty: number }
export interface Order {
  id: number; userId: number; createdAt: number; status: OrderStatus;
  items: OrderItem[]; subtotal: number; delivery: number; total: number;
  name: string; phone: string; pickup: boolean; address: string; comment: string;
}
interface DbShape { seq: number; orders: Order[] }

export interface Notifier {
  newOrder(o: Order): Promise<void>;
  statusChanged(o: Order): Promise<void>;
}
export type CreateResult = { ok: true; order: Order } | { ok: false; error: string };

const PHONE = /^\+?[0-9\s\-()]{9,18}$/;

/** Допустимые переходы: повторный тап или кнопка из старого сообщения не откатит статус назад */
const NEXT: Record<OrderStatus, OrderStatus[]> = { new: ["accepted", "canceled"], accepted: ["delivering", "canceled"], delivering: ["done"], done: [], canceled: [] };
export type StatusResult = { ok: true; order: Order } | { ok: false; error: string };

export class Shop {
  db: JsonDb<DbShape>;
  private hits = new Map<number, number[]>();

  constructor(file: string, private notifier: Notifier) { this.db = new JsonDb<DbShape>(file, { seq: 0, orders: [] }); }

  create(userId: number, raw: any): CreateResult {
    const now = Date.now();
    const recent = (this.hits.get(userId) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= 10) return { ok: false, error: "Слишком много заказов за час, попробуйте позже" };

    if (!Array.isArray(raw?.items) || raw.items.length === 0 || raw.items.length > 30) return { ok: false, error: "Корзина пуста" };
    const items: OrderItem[] = [];
    for (const it of raw.items) {
      const p = typeof it?.id === "string" ? productById(it.id) : undefined;
      const qty = it?.qty;
      if (!p || !Number.isInteger(qty) || qty < 1 || qty > 20) return { ok: false, error: "В корзине некорректный товар" };
      items.push({ id: p.id, name: p.name, price: p.price, qty });
    }

    const name = String(raw.name ?? "").trim();
    const phone = String(raw.phone ?? "").trim();
    const pickup = raw.pickup === true;
    const address = String(raw.address ?? "").trim();
    const comment = String(raw.comment ?? "").trim().slice(0, 300);
    if (name.length < 2 || name.length > 60) return { ok: false, error: "Укажите имя" };
    if (!PHONE.test(phone)) return { ok: false, error: "Укажите телефон в формате +998 90 123 45 67" };
    if (!pickup && (address.length < 5 || address.length > 200)) return { ok: false, error: "Укажите адрес доставки" };

    const t = totals(items.map(({ id, qty }) => ({ id, qty })), pickup);
    const order: Order = { id: ++this.db.data.seq, userId, createdAt: now, status: "new", items, ...t, name, phone, pickup, address: pickup ? "" : address, comment };
    this.db.data.orders.push(order);
    recent.push(now); this.hits.set(userId, recent);
    this.db.save();
    void this.notifier.newOrder(order).catch((e) => console.error("Не удалось отправить заказ:", e.message));
    return { ok: true, order };
  }

  get(id: number) { return this.db.data.orders.find((o) => o.id === id); }

  setStatus(id: number, status: OrderStatus): StatusResult {
    const o = this.get(id);
    if (!o) return { ok: false, error: "Заказ не найден" };
    if (!NEXT[o.status].includes(status)) return { ok: false, error: "Статус уже изменён" };
    o.status = status;
    this.db.save();
    void this.notifier.statusChanged(o).catch(() => {});
    return { ok: true, order: o };
  }

  active() { return this.db.data.orders.filter((o) => o.status !== "done" && o.status !== "canceled"); }
  forUser(userId: number, n = 5) { return this.db.data.orders.filter((o) => o.userId === userId).slice(-n).reverse(); }
}
