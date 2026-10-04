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

const DEMO_NOTE =
  "🧪 <b>Демо CaravanHouse.</b> Сейчас вы — владелец магазина: так заказ видит продавец. Меняйте статус кнопками ниже — уведомления покупателю тоже придут вам.\n\n";

/**
 * demo = true: карточку владельца с кнопками получает сам покупатель. Посетитель сайта проходит обе роли,
 * а настоящему владельцу (OWNER_CHAT_ID) демо-заказы не приходят.
 */
export function telegramNotifier(api: Api, ownerChatId?: string, demo = false): Notifier {
  return {
    async newOrder(o) {
      if (demo) {
        await api.sendMessage(o.userId, `✅ Заказ №${o.id} оформлен на ${money(o.total)}.`);
        await api.sendMessage(o.userId, DEMO_NOTE + orderText(o), { parse_mode: "HTML", reply_markup: orderKeyboard(o) });
        return;
      }
      // владельцу и клиенту отправляем независимо: сбой одного сообщения не мешает второму
      const [owner] = await Promise.allSettled([
        ownerChatId ? api.sendMessage(ownerChatId, orderText(o), { parse_mode: "HTML", reply_markup: orderKeyboard(o) }) : undefined,
        api.sendMessage(o.userId, `✅ Заказ №${o.id} оформлен на ${money(o.total)}. Мы напишем, когда начнём собирать.`),
      ]);
      if (owner.status === "rejected") throw owner.reason;
    },
    async statusChanged(o) {
      const text = customerText(o);
      if (text) await api.sendMessage(o.userId, text).catch(() => {});
    },
  };
}

export function registerHandlers(bot: Bot, shop: Shop, opts: { webappUrl?: string; ownerChatId?: string; demo?: boolean }) {
  const isOwner = (chatId?: number) => !!opts.ownerChatId && String(chatId) === String(opts.ownerChatId);
  // в демо статусом своего заказа управляет сам покупатель (и только своим)
  const canManage = (orderId: number, chatId?: number, userId?: number) =>
    isOwner(chatId) || (!!opts.demo && shop.get(orderId)?.userId === userId && chatId === userId);
  const openKb = () => (opts.webappUrl ? new InlineKeyboard().webApp("💐 Открыть магазин", opts.webappUrl) : undefined);

  const intro = opts.demo
    ? "🌷 <b>Лола · цветы</b> — демо-магазин от CaravanHouse.\n\nОформите заказ в каталоге, а потом побудьте владельцем: меняйте статус заказа кнопками и смотрите, что получает покупатель. Ничего не доставляется и не оплачивается.\n\n/my — мои заказы"
    : "🌷 <b>Лола · цветы</b>\n\nВыберите букет в каталоге, оформите заказ — и мы привезём.\n\n/my — мои заказы";
  bot.command("start", (ctx) => ctx.reply(intro, { parse_mode: "HTML", reply_markup: openKb() }));
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
    if (!canManage(Number(ctx.match[1]), ctx.chat?.id, ctx.from?.id)) return ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    const r = shop.setStatus(Number(ctx.match[1]), ctx.match[2] as OrderStatus);
    if (!r.ok) return ctx.answerCallbackQuery({ text: r.error });
    await ctx.editMessageText(orderText(r.order), { parse_mode: "HTML", reply_markup: orderKeyboard(r.order) });
    return ctx.answerCallbackQuery({ text: STATUS[r.order.status] });
  });
}

export async function setupMenu(bot: Bot, webappUrl?: string) {
  if (!webappUrl) return;
  try {
    await bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "Магазин", web_app: { url: webappUrl } } });
    await bot.api.setMyCommands([{ command: "start", description: "Открыть магазин" }, { command: "my", description: "Мои заказы" }]);
  } catch (e) { console.warn("Не удалось настроить меню:", (e as Error).message); }
}
