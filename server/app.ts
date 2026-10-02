import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { authMiddleware } from "./auth";
import type { Shop } from "./shop";

export function createApp(shop: Shop, botToken: string, devNoAuth: boolean, distDir: string) {
  const app = express();
  app.use(express.json({ limit: "20kb" }));
  app.get("/health", (_q, r) => { r.json({ ok: true }); });

  app.post("/api/order", authMiddleware(botToken, devNoAuth), (req, res) => {
    const r = shop.create(res.locals.user.id, req.body);
    if (!r.ok) { res.status(400).json({ error: r.error }); return; }
    res.json({ id: r.order.id, total: r.order.total });
  });

  if (existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("*", (_q, r) => { r.sendFile(join(distDir, "index.html")); });
  }
  return app;
}
