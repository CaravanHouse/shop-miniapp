import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { Bot } from "grammy";
import { createApp } from "../server/app";
import { orderText, registerHandlers } from "../server/bot";
import { Shop, type Order } from "../server/shop";
import { totals } from "../shared/products";

// 1. формула суммы
assert.deepEqual(totals([{ id: "s2", qty: 5 }], false), { subtotal: 90_000, delivery: 25_000, total: 115_000 }, "доставка платная до порога");
assert.equal(totals([{ id: "b5", qty: 1 }], false).delivery, 0, "от 400 000 доставка бесплатна");
assert.equal(totals([{ id: "s2", qty: 1 }], true).delivery, 0, "самовывоз без доставки");

// 2. создание заказа
const placed: Order[] = [], changed: Order[] = [];
const shop = new Shop(join(mkdtempSync(join(tmpdir(), "shop-")), "s.json"), { async newOrder(o) { placed.push(o); }, async statusChanged(o) { changed.push(o); } });
const good = { items: [{ id: "b1", qty: 1 }, { id: "s1", qty: 3 }], name: "Дилноза", phone: "+998 90 123 45 67", pickup: false, address: "Мирзо Улугбек, 12", comment: "<script>" };

assert.equal(shop.create(1, { ...good, items: [] }).ok, false, "пустая корзина");
assert.equal(shop.create(1, { ...good, items: [{ id: "hack", qty: 1 }] }).ok, false, "несуществующий товар");
assert.equal(shop.create(1, { ...good, items: [{ id: "b1", qty: -5 }] }).ok, false, "отрицательное количество");
assert.equal(shop.create(1, { ...good, phone: "abc" }).ok, false, "плохой телефон");
assert.equal(shop.create(1, { ...good, address: "" }).ok, false, "нет адреса при доставке");
const r = shop.create(1, { ...good, price: 1, total: 1 }); // клиентские цены игнорируются
assert.ok(r.ok);
if (r.ok) { assert.equal(r.order.subtotal, 280_000 + 3 * 35_000); assert.equal(r.order.total, r.order.subtotal + 25_000); }
await new Promise((x) => setTimeout(x, 10));
assert.equal(placed.length, 1);
assert.ok(orderText(placed[0]).includes("&lt;script&gt;"), "комментарий экранируется");

// 3. API с подписью Telegram
const TOKEN = "123:TEST";
function sign(u: object) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(u), query_id: "q" });
  const check = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
  p.set("hash", createHmac("sha256", createHmac("sha256", "WebAppData").update(TOKEN).digest()).update(check).digest("hex"));
  return p.toString();
}
const server = createApp(shop, TOKEN, false, "/none").listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = (init?: string) => fetch(base + "/api/order", { method: "POST", headers: { "Content-Type": "application/json", ...(init ? { "X-Init-Data": init } : {}) }, body: JSON.stringify(good) });
assert.equal((await post()).status, 401, "без подписи заказ не принимается");
const okRes = await post(sign({ id: 77, first_name: "Дилноза" }));
assert.equal(okRes.status, 200);
assert.equal(((await okRes.json()) as { id: number }).id, 2);
server.close();

// 4. кнопки статусов у владельца и уведомления клиенту
const calls: { method: string; payload: any }[] = [];
const bot = new Bot(TOKEN, { botInfo: { id: 123, is_bot: true, first_name: "t", username: "t_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false } as any });
bot.api.config.use(async (_p, method, payload) => { calls.push({ method, payload }); return { ok: true, result: true } as any; });
registerHandlers(bot, shop, { ownerChatId: "555" });
const cb = (chatId: number, data: string) => ({ update_id: Math.floor(Math.random() * 1e6), callback_query: { id: "c", chat_instance: "x", from: { id: 9, is_bot: false, first_name: "Хозяйка" }, data, message: { message_id: 3, date: 0, chat: { id: chatId, type: "private" }, text: "x" } } } as any);

await bot.handleUpdate(cb(999, "ord:1:accepted"));
assert.equal(shop.get(1)?.status, "new", "чужой чат не меняет статус");
await bot.handleUpdate(cb(555, "ord:1:accepted"));
assert.equal(shop.get(1)?.status, "accepted");
assert.ok(calls.some((c) => c.method === "editMessageText" && String(c.payload.text).includes("Собираем")), "сообщение владельца обновлено");
assert.equal(changed.at(-1)?.status, "accepted", "клиенту уходит уведомление о статусе");
await bot.handleUpdate(cb(555, "ord:1:delivering"));
await bot.handleUpdate(cb(555, "ord:1:done"));
assert.equal(shop.get(1)?.status, "done");

console.log("✓ все проверки пройдены");
process.exit(0);
