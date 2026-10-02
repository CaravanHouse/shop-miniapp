import { Api, Bot, InlineKeyboard } from "grammy";
import { esc } from "./auth";
import type { Notifier, Order, OrderStatus, Shop } from "./shop";
import { money } from "../shared/products";

const STATUS: Record<OrderStatus, string> = { new: "🆕 Новый", accepted: "👩‍🌾 Собираем", delivering: "🚚 В пути", done: "✅ Выдан", canceled: "🚫 Отменён" };

export function orderText(o: Order): string {
  const lines = o.items.map((i) => `• ${esc(i.name)} × ${i.qty} — ${money(i.price * i.qty)}`);
  return [
    `<b>Заказ №${o.id}</b> · ${STATUS[o.status]}`,
    "",
    ...lines,
    ...(o.delivery ? [`Доставка — ${money(o.delivery)}`] : []),
    `<b>Итого: ${money(o.total)}</b>`,
    "",
    `👤 ${esc(o.name)}  📞 ${esc(o.phone)}`,
    o.pickup ? "🏪 Самовывоз" : `📍 ${esc(o.address)}`,
    ...(o.comment ? [`💬 ${esc(o.comment)}`] : []),
  ].join("\n");
}

export function orderKeyboard(o: Order): InlineKeyboard | undefined {
  const kb = new InlineKeyboard();
  switch (o.status) {
    case "new": kb.text("👩‍🌾 Принять", `ord:${o.id}:accepted`).text("🚫 Отменить", `ord:${o.id}:canceled`); break;
    case "accepted": kb.text(o.pickup ? "🏪 Готов к выдаче" : "🚚 Передан курьеру", `ord:${o.id}:delivering`).row().text("🚫 Отменить", `ord:${o.id}:canceled`); break;
    case "delivering": kb.text("✅ Выдан", `ord:${o.id}:done`); break;
    default: return undefined;
  }
  return kb;
}

const customerText = (o: Order): string | null => {
  switch (o.status) {
    case "accepted": return `👩‍🌾 Заказ №${o.id} принят, собираем букет.`;
    case "delivering": return o.pickup ? `🏪 Заказ №${o.id} готов к выдаче!` : `🚚 Заказ №${o.id} передан курьеру и уже в пути.`;
    case "done": return `🎉 Заказ №${o.id} выдан. Спасибо, что выбрали нас!`;
    case "canceled": return `🚫 Заказ №${o.id} отменён. Если это ошибка — напишите нам.`;
    default: return null;
  }
};

export function telegramNotifier(api: Api, ownerChatId?: string): Notifier {
  return {
    async newOrder(o) {
      if (ownerChatId) await api.sendMessage(ownerChatId, orderText(o), { parse_mode: "HTML", reply_markup: orderKeyboard(o) });
      await api.sendMessage(o.userId, `✅ Заказ №${o.id} оформлен на ${money(o.total)}. Мы напишем, когда начнём собирать.`).catch(() => {});
    },
    async statusChanged(o) {
      const text = customerText(o);
      if (text) await api.sendMessage(o.userId, text).catch(() => {});
    },
  };
}

export function registerHandlers(bot: Bot, shop: Shop, opts: { webappUrl?: string; ownerChatId?: string }) {
  const isOwner = (chatId?: number) => !!opts.ownerChatId && String(chatId) === String(opts.ownerChatId);
  const openKb = () => (opts.webappUrl ? new InlineKeyboard().webApp("💐 Открыть магазин", opts.webappUrl) : undefined);

  bot.command("start", (ctx) => ctx.reply("🌷 <b>Лола · цветы</b>\n\nВыберите букет в каталоге, оформите заказ — и мы привезём.\n\n/my — мои заказы", { parse_mode: "HTML", reply_markup: openKb() }));
  bot.command("id", (ctx) => ctx.reply(`id этого чата: <code>${ctx.chat.id}</code>\nВпишите его в OWNER_CHAT_ID.`, { parse_mode: "HTML" }));

  bot.command("my", (ctx) => {
    const list = ctx.from ? shop.forUser(ctx.from.id) : [];
    if (list.length === 0) return ctx.reply("Заказов пока нет.", { reply_markup: openKb() });
    return ctx.reply(list.map((o) => `№${o.id} · ${STATUS[o.status]} · ${money(o.total)}`).join("\n"));
  });

  bot.command("orders", (ctx) => {
    if (!isOwner(ctx.chat.id)) return;
    const list = shop.active();
    if (list.length === 0) return ctx.reply("Активных заказов нет 🎉");
    return ctx.reply(list.map((o) => `№${o.id} · ${STATUS[o.status]} · ${o.name} · ${money(o.total)}`).join("\n"));
  });

  bot.callbackQuery(/^ord:(\d+):(accepted|delivering|done|canceled)$/, async (ctx) => {
    if (!isOwner(ctx.chat?.id)) return ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    const o = shop.setStatus(Number(ctx.match[1]), ctx.match[2] as OrderStatus);
    if (!o) return ctx.answerCallbackQuery({ text: "Заказ не найден" });
    await ctx.editMessageText(orderText(o), { parse_mode: "HTML", reply_markup: orderKeyboard(o) });
    return ctx.answerCallbackQuery({ text: STATUS[o.status] });
  });
}

export async function setupMenu(bot: Bot, webappUrl?: string) {
  if (!webappUrl) return;
  try {
    await bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "Магазин", web_app: { url: webappUrl } } });
    await bot.api.setMyCommands([{ command: "start", description: "Открыть магазин" }, { command: "my", description: "Мои заказы" }]);
  } catch (e) { console.warn("Не удалось настроить меню:", (e as Error).message); }
}
