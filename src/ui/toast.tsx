import { useEffect, useState } from 'react';

type Msg = { id: number; text: string };
let id = 0;
const subs = new Set<(m: Msg) => void>();
export const toast = (text: string) => subs.forEach((s) => s({ id: ++id, text }));

export function ToastHost() {
  const [items, setItems] = useState<Msg[]>([]);
  useEffect(() => {
    const fn = (m: Msg) => {
      setItems((x) => [...x, m]);
      setTimeout(() => setItems((x) => x.filter((y) => y.id !== m.id)), 4200);
    };
    subs.add(fn);
    return () => void subs.delete(fn);
  }, []);
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}
