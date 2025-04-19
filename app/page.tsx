"use client";

import dynamic from "next/dynamic";

// Используем dynamic import, чтобы избежать ошибок SSR, связанных с DOM-операциями
const Game = dynamic(() => import("./components/Game"), {
  ssr: false,
  loading: () => <div className="text-center p-8">Загрузка игры...</div>,
});

export default function Home() {
  return <Game />;
}
