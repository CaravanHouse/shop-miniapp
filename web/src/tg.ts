import { useEffect } from "react";

interface MainButton {
  setText(t: string): void; show(): void; hide(): void; enable(): void; disable(): void;
  onClick(f: () => void): void; offClick(f: () => void): void;
  showProgress(leaveActive?: boolean): void; hideProgress(): void;
}
interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string } };
  MainButton: MainButton;
  ready(): void; expand(): void; close(): void;
  HapticFeedback?: { notificationOccurred(t: "success" | "error"): void; impactOccurred(s: "light" | "medium"): void };
}
declare global { interface Window { Telegram?: { WebApp: TgWebApp } } }

/**
 * undefined, если открыто просто в браузере. Скрипт telegram-web-app.js создаёт WebApp и вне Telegram,
 * поэтому настоящий Telegram узнаём по initData: без него вместо MainButton показываем свою кнопку внизу.
 */
const webApp = window.Telegram?.WebApp;
export const tg = webApp?.initData ? webApp : undefined;
export const initData = () => tg?.initData ?? "";
export const haptic = (t: "success" | "error") => tg?.HapticFeedback?.notificationOccurred(t);
export const tap = () => tg?.HapticFeedback?.impactOccurred("light");

export interface Primary { text: string; visible: boolean; loading: boolean; onClick: () => void }

/** Главная кнопка Telegram. В обычном браузере её роль играет нижняя кнопка на странице. */
export function useMainButton({ text, visible, loading, onClick }: Primary) {
  useEffect(() => {
    const mb = tg?.MainButton;
    if (!mb) return;
    mb.setText(text);
    visible ? mb.show() : mb.hide();
    loading ? (mb.showProgress(false), mb.disable()) : (mb.hideProgress(), mb.enable());
    mb.onClick(onClick);
    return () => mb.offClick(onClick);
  }, [text, visible, loading, onClick]);
}
