import { useCallback, useMemo, useState } from "react";
import { CATEGORIES, PRODUCTS, money, productById, totals, type CategoryId, type Product } from "../../shared/products";
import { haptic, initData, tap, tg, useMainButton } from "./tg";

type View = "catalog" | "cart" | "checkout" | "done";
type Cart = Record<string, number>;

function Qty({ qty, onChange, small }: { qty: number; onChange: (n: number) => void; small?: boolean }) {
  return (
    <div className={small ? "qty small" : "qty"}>
      <button onClick={() => onChange(qty - 1)} aria-label="Меньше">−</button>
      <span aria-live="polite">{qty}</span>
      <button onClick={() => onChange(qty + 1)} aria-label="Больше">+</button>
    </div>
  );
}

function Card({ p, qty, onChange }: { p: Product; qty: number; onChange: (n: number) => void }) {
  return (
    <article className="product">
      <div className="pic" style={{ background: `radial-gradient(circle at 30% 20%, hsl(${p.hue} 85% 94%), hsl(${p.hue} 70% 82%))` }}><span>{p.emoji}</span></div>
      <h3>{p.name}</h3>
      <p className="desc">{p.desc}</p>
      <div className="buy">
        <b>{money(p.price)}</b>
        {qty === 0 ? <button className="add" onClick={() => onChange(1)}>В корзину</button> : <Qty qty={qty} onChange={onChange} small />}
      </div>
    </article>
  );
}

export default function App() {
  const [view, setView] = useState<View>("catalog");
  const [cat, setCat] = useState<CategoryId | "all">("all");
  const [cart, setCart] = useState<Cart>({});
  const [name, setName] = useState(tg?.initDataUnsafe.user?.first_name ?? "");
  const [phone, setPhone] = useState("");
  const [pickup, setPickup] = useState(false);
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState(0);

  const lines = useMemo(() => Object.entries(cart).filter(([, q]) => q > 0).map(([id, qty]) => ({ id, qty })), [cart]);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const sum = totals(lines, pickup);

  const setQty = (id: string, qty: number) => { tap(); setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(20, qty)) })); };

  const submit = useCallback(async () => {
    setError("");
    if (name.trim().length < 2) return setError("Укажите имя");
    if (!/^\+?[0-9\s\-()]{9,18}$/.test(phone.trim())) return setError("Телефон в формате +998 90 123 45 67");
    if (!pickup && address.trim().length < 5) return setError("Укажите адрес доставки");
    setSending(true);
    try {
      const res = await fetch("/api/order", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Init-Data": initData() },
        body: JSON.stringify({ items: lines, name, phone, pickup, address, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(res.status === 401 ? "Откройте магазин из Telegram, чтобы оформить заказ" : data.error);
      setOrderId(data.id); setCart({}); setView("done"); haptic("success");
    } catch (e) {
      setError((e as Error).message || "Не удалось отправить заказ"); haptic("error");
    } finally { setSending(false); }
  }, [lines, name, phone, pickup, address, comment]);

  // одна «главная кнопка» на все экраны
  const primary = useMemo(() => {
    if (view === "catalog") return { text: `Корзина · ${money(sum.subtotal)}`, visible: count > 0, loading: false, onClick: () => setView("cart") };
    if (view === "cart") return { text: "Оформить заказ", visible: count > 0, loading: false, onClick: () => setView("checkout") };
    if (view === "checkout") return { text: `Заказать · ${money(sum.total)}`, visible: true, loading: sending, onClick: () => void submit() };
    return { text: "Закрыть", visible: true, loading: false, onClick: () => (tg ? tg.close() : setView("catalog")) };
  }, [view, count, sum.subtotal, sum.total, sending, submit]);
  useMainButton(primary);

  const shown = cat === "all" ? PRODUCTS : PRODUCTS.filter((p) => p.cat === cat);
  const back = view === "cart" ? "catalog" : view === "checkout" ? "cart" : null;

  return (
    <div className="app">
      <header>
        {back ? <button className="back" onClick={() => setView(back)}>← Назад</button> : <h1>Лола <i>цветы</i></h1>}
        {view === "catalog" && <p>Свежие букеты с доставкой по Ташкенту</p>}
      </header>

      {view === "catalog" && (
        <>
          <nav className="chips" aria-label="Категории">
            <button aria-pressed={cat === "all"} onClick={() => setCat("all")}>Все</button>
            {CATEGORIES.map((c) => <button key={c.id} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.title}</button>)}
          </nav>
          <div className="grid">{shown.map((p) => <Card key={p.id} p={p} qty={cart[p.id] ?? 0} onChange={(n) => setQty(p.id, n)} />)}</div>
        </>
      )}

      {view === "cart" && (
        <section>
          <h2>Корзина</h2>
          <ul className="lines">
            {lines.map((l) => { const p = productById(l.id)!; return (
              <li key={l.id}>
                <span className="e">{p.emoji}</span>
                <div><b>{p.name}</b><small>{money(p.price)}</small></div>
                <Qty qty={l.qty} onChange={(n) => setQty(l.id, n)} small />
              </li>
            ); })}
          </ul>
          <dl className="sum">
            <div><dt>Товары</dt><dd>{money(sum.subtotal)}</dd></div>
            <div><dt>Доставка</dt><dd>{sum.delivery ? money(sum.delivery) : "бесплатно"}</dd></div>
            <div className="total"><dt>Итого</dt><dd>{money(sum.total)}</dd></div>
          </dl>
        </section>
      )}

      {view === "checkout" && (
        <section>
          <h2>Оформление</h2>
          <div className="seg" role="group" aria-label="Способ получения">
            <button aria-pressed={!pickup} onClick={() => setPickup(false)}>Доставка</button>
            <button aria-pressed={pickup} onClick={() => setPickup(true)}>Самовывоз</button>
          </div>
          <label>Имя<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <label>Телефон<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+998 90 123 45 67" autoComplete="tel" /></label>
          {!pickup && <label>Адрес доставки<input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Улица, дом, ориентир" autoComplete="street-address" /></label>}
          <label>Комментарий<textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Время, текст открытки…" maxLength={300} /></label>
          {error && <p className="err" role="alert">{error}</p>}
          <p className="fine">{pickup ? "Самовывоз бесплатно." : sum.delivery ? "Доставка 25 000 сум, от 400 000 сум — бесплатно." : "Доставка бесплатно."}</p>
        </section>
      )}

      {view === "done" && (
        <section className="done" role="status">
          <div className="big">💐</div>
          <h2>Заказ №{orderId} оформлен</h2>
          <p>Мы написали вам в чат с ботом и будем сообщать о каждом шаге.</p>
          <button className="ghost" onClick={() => setView("catalog")}>Вернуться в каталог</button>
        </section>
      )}

      {!tg && primary.visible && view !== "done" && (
        <div className="dock"><button className="cta" onClick={primary.onClick} disabled={primary.loading}>{primary.loading ? "Отправляю…" : primary.text}</button></div>
      )}
    </div>
  );
}
