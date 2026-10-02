import "dotenv/config";
import { Bot } from "grammy";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { registerHandlers, setupMenu, telegramNotifier } from "./bot";
import { Shop, type Notifier } from "./shop";

const token = process.env.BOT_TOKEN;
const devNoAuth = process.env.DEV_NO_AUTH === "1";
const webappUrl = process.env.WEBAPP_URL;
const ownerChatId = process.env.OWNER_CHAT_ID;
const port = Number(process.env.PORT ?? 3000);

if (!token && !devNoAuth) { console.error("Укажите BOT_TOKEN в .env (или DEV_NO_AUTH=1 для запуска без бота)"); process.exit(1); }
if (token && !ownerChatId) console.warn("OWNER_CHAT_ID не задан: напишите боту /id и впишите значение в .env");

const bot = token ? new Bot(token) : null;
const log: Notifier = { async newOrder(o) { console.log("Новый заказ (Telegram не настроен):", o.id, o.total); }, async statusChanged() {} };
const shop = new Shop(join(process.cwd(), "data", "shop.json"), bot ? telegramNotifier(bot.api, ownerChatId) : log);

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
createApp(shop, token ?? "dev", devNoAuth, dist).listen(port, () => console.log(`Магазин: http://localhost:${port}`));

if (bot) {
  registerHandlers(bot, shop, { webappUrl, ownerChatId });
  bot.catch((e) => console.error("Ошибка бота:", e.message));
  void setupMenu(bot, webappUrl);
  void bot.start({ onStart: (me) => console.log(`Бот @${me.username} запущен`) });
}
process.on("SIGTERM", () => { shop.db.flush(); process.exit(0); });
