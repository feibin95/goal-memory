'use client';
import { useState, useCallback, useEffect } from 'react';

let _showToast: ((msg: string) => void) | null = null;
export function toast(message: string) { _showToast?.(message); }

export function ToastProvider() {
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([]);
  const [counter, setCounter] = useState(0);

  const show = useCallback((msg: string) => {
    const id = counter + 1;
    setCounter((c) => c + 1);
    setMessages((m) => [...m, { id, text: msg }]);
    setTimeout(() => setMessages((m) => m.filter((x) => x.id !== id)), 2400);
  }, [counter]);

  useEffect(() => { _showToast = show; return () => { _showToast = null; }; }, [show]);

  if (!messages.length) return null;
  return <>{messages.map((m) => <div key={m.id} className="toast">{m.text}</div>)}</>;
}
