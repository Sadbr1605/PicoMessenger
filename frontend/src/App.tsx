import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, LogOut, Send, Smartphone, Wifi } from "lucide-react";
import type { Credentials, Message, PollResponse } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "";

function clampText(s: string, max = 280) {
  const t = s.replace(/\r\n/g, "\n");
  return t.length > max ? t.slice(0, max) : t;
}

export default function App() {
  const [creds, setCreds] = useState<Credentials | null>(() => {
    const raw = localStorage.getItem("pico_creds");
    try {
      return raw ? (JSON.parse(raw) as Credentials) : null;
    } catch {
      return null;
    }
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [latestId, setLatestId] = useState<number>(0);

  const [threadId, setThreadId] = useState("");
  const [pairCode, setPairCode] = useState("");

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [status, setStatus] = useState<"offline" | "connecting" | "online">(
    creds ? "connecting" : "offline"
  );
  const [error, setError] = useState<string>("");

  const endRef = useRef<HTMLDivElement | null>(null);

  const canUseApi = useMemo(() => {
    // Se API_URL estiver vazio, o front tenta mesma origem (útil se você proxyar depois).
    // Para Cloud Functions, normalmente você vai setar VITE_API_URL com https://.../api
    return true;
  }, []);

  const logout = useCallback(() => {
    setCreds(null);
    localStorage.removeItem("pico_creds");
    setMessages([]);
    setLatestId(0);
    setStatus("offline");
    setError("");
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!creds) return;
    if (!canUseApi) return;

    setStatus((s) => (s === "online" ? "online" : "connecting"));

    const params = new URLSearchParams({
      thread_id: creds.thread_id,
      pair_code: creds.pair_code,
      after: String(latestId),
    });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${API_URL}/web_pull?${params.toString()}`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.status === 403) {
        setError("Pareamento inválido. Confira o thread_id e o pair_code.");
        logout();
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as PollResponse;

      if (Array.isArray(data.msgs) && data.msgs.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.msg_id));
          const merged = [...prev];
          for (const m of data.msgs) {
            if (!seen.has(m.msg_id)) merged.push(m);
          }
          merged.sort((a, b) => a.msg_id - b.msg_id);
          return merged;
        });
      }
      if (typeof data.latest === "number") setLatestId(data.latest);

      setStatus("online");
    } catch {
      setStatus("offline");
      // não spammar erro no UI a cada poll; só mantém offline
    }
  }, [API_URL, canUseApi, creds, latestId, logout]);

  useEffect(() => {
    if (!creds) return;
    setError("");
    setStatus("connecting");

    fetchMessages();
    const id = setInterval(fetchMessages, 2000);

    return () => clearInterval(id);
  }, [creds, fetchMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const t = threadId.trim();
    const p = pairCode.trim();
    if (!t || !p) {
      setError("Preencha thread_id e pair_code.");
      return;
    }
    const next: Credentials = { thread_id: t, pair_code: p };
    setCreds(next);
    localStorage.setItem("pico_creds", JSON.stringify(next));
    setMessages([]);
    setLatestId(0);
    setStatus("connecting");
    setError("");
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creds || sending) return;

    const text = clampText(input.trim(), 280);
    if (!text) return;

    setSending(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/web_send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: creds.thread_id,
          pair_code: creds.pair_code,
          text,
        }),
      });

      if (res.status === 403) {
        setError("Pareamento inválido. Confira o thread_id e o pair_code.");
        logout();
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setInput("");
      fetchMessages();
    } catch {
      setError("Falha ao enviar. Verifique a API e tente novamente.");
    } finally {
      setSending(false);
    }
  };

  if (!creds) {
    return (
      <div className="page">
        <div className="card">
          <div className="titleRow">
            <Smartphone size={20} />
            <h1>PicoMessenger</h1>
          </div>
          <p className="muted">
            Digite o <b>thread_id</b> e o <b>pair_code</b> mostrados no OLED da BitDogLab.
          </p>

          {!API_URL && (
            <div className="warn">
              VITE_API_URL não está definido. Configure na Vercel (ex.: https://us-central1-SEU_PROJ.cloudfunctions.net/api).
            </div>
          )}

          {error && <div className="error">{error}</div>}

          <form onSubmit={handleLogin} className="form">
            <label>
              Thread ID
              <input
                value={threadId}
                onChange={(e) => setThreadId(e.target.value)}
                placeholder="ex.: abcd1234"
                autoComplete="off"
              />
            </label>
            <label>
              Pair Code
              <input
                value={pairCode}
                onChange={(e) => setPairCode(e.target.value)}
                placeholder="ex.: 123456"
                inputMode="numeric"
                autoComplete="off"
              />
            </label>

            <button className="btn primary" type="submit">
              Conectar
            </button>
          </form>
        </div>

        <div className="footerNote">
          API atual: <code>{API_URL || "(mesma origem)"}</code>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="chatCard">
        <div className="chatHeader">
          <div className="chatHeaderLeft">
            <div className="pill">
              <Smartphone size={16} />
              <span className="mono">{creds.thread_id}</span>
            </div>
            <div className={`status ${status}`}>
              <Wifi size={16} />
              <span>
                {status === "online" ? "online" : status === "connecting" ? "conectando" : "offline"}
              </span>
            </div>
          </div>

          <button className="btn ghost" onClick={logout} title="Sair">
            <LogOut size={16} /> Sair
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="chatBody">
          {messages.length === 0 ? (
            <div className="empty">
              <div className="emptyTitle">Sem mensagens ainda</div>
              <div className="muted">Envie uma mensagem para começar.</div>
            </div>
          ) : (
            messages.map((m) => {
              const mine = m.from === "web";
              return (
                <div key={m.msg_id} className={`msgRow ${mine ? "mine" : "theirs"}`}>
                  <div className={`msgBubble ${mine ? "mine" : "theirs"}`}>
                    <div className="msgText">{m.text}</div>
                    <div className="msgMeta">
                      <span className="mono">#{m.msg_id}</span>
                      <span>
                        {new Date(m.ts).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <form className="chatInput" onSubmit={handleSend}>
          <input
            value={input}
            onChange={(e) => setInput(clampText(e.target.value, 280))}
            placeholder="Digite uma mensagem…"
            maxLength={280}
          />
          <div className="counter">{input.length}/280</div>
          <button className="btn primary" type="submit" disabled={sending || !input.trim()}>
            {sending ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
