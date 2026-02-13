import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, LogOut, Wifi, WifiOff, Smartphone, Loader2, MessageSquare, AlertCircle } from 'lucide-react';
import { Message, Credentials } from './types';

// Configuração de API via variável de ambiente do Vite
// @ts-ignore
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const API_URL = `${API_BASE}/api`;

function App() {
  const [creds, setCreds] = useState<Credentials | null>(() => {
    const saved = localStorage.getItem('pico_creds');
    return saved ? JSON.parse(saved) : null;
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [latestId, setLatestId] = useState(0);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Monitorar status da rede do navegador
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Login/Pareamento
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const thread_id = (formData.get('thread_id') as string).trim();
    const pair_code = (formData.get('pair_code') as string).trim();

    if (thread_id && pair_code) {
      const newCreds = { thread_id, pair_code };
      setCreds(newCreds);
      localStorage.setItem('pico_creds', JSON.stringify(newCreds));
      setError(null);
      setMessages([]);
      setLatestId(0);
    }
  };

  const logout = () => {
    if (confirm("Deseja desconectar deste dispositivo?")) {
      setCreds(null);
      localStorage.removeItem('pico_creds');
      setMessages([]);
      setLatestId(0);
    }
  };

  // Lógica de Busca de Mensagens (Pull)
  const fetchMessages = useCallback(async () => {
    if (!creds || !isOnline) return;

    try {
      const params = new URLSearchParams({
        thread_id: creds.thread_id,
        pair_code: creds.pair_code,
        after: latestId.toString()
      });

      const response = await fetch(`${API_URL}/web_pull?${params}`);
      
      if (response.status === 403) {
        setCreds(null);
        localStorage.removeItem('pico_creds');
        setError("Código de pareamento inválido ou expirado.");
        return;
      }

      if (!response.ok) throw new Error("Erro ao buscar mensagens");

      const data = await response.json();
      
      if (data.msgs && data.msgs.length > 0) {
        setMessages(prev => {
          // Evita duplicatas comparando IDs
          const existingIds = new Set(prev.map(m => m.msg_id));
          const filteredNew = data.msgs.filter((m: Message) => !existingIds.has(m.msg_id));
          return [...prev, ...filteredNew].sort((a, b) => a.msg_id - b.msg_id);
        });
        setLatestId(data.latest);
      }
      setError(null);
    } catch (err) {
      console.error("Polling error:", err);
      // Não mostramos erro gritante no polling para não estragar a UX, 
      // apenas se persistir ou falhar no envio.
    }
  }, [creds, latestId, isOnline]);

  // Efeito de Polling (2 segundos)
  useEffect(() => {
    if (!creds) return;
    
    fetchMessages(); // Primeira carga
    const interval = setInterval(fetchMessages, 2000);
    
    return () => clearInterval(interval);
  }, [creds, fetchMessages]);

  // Auto-scroll para baixo
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  // Envio de Mensagem
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !creds || isSending || !isOnline) return;

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/web_send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: creds.thread_id,
          pair_code: creds.pair_code,
          text: inputText.trim()
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Falha ao enviar");
      }

      setInputText('');
      fetchMessages(); // Pull imediato para atualizar a lista
    } catch (err: any) {
      setError(err.message || "Erro de conexão ao enviar.");
    } finally {
      setIsSending(false);
    }
  };

  // --- RENDER: TELA DE PAREAMENTO ---
  if (!creds) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
        <div className="bg-white w-full max-w-sm rounded-3xl shadow-xl p-8 border border-slate-200">
          <div className="flex flex-col items-center mb-8">
            <div className="bg-blue-600 p-4 rounded-2xl shadow-lg shadow-blue-200 mb-4">
              <Smartphone size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">PicoMessenger</h1>
            <p className="text-slate-500 text-center text-sm mt-2">
              Conecte-se à sua placa BitDogLab usando as informações da tela OLED.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-6 text-sm flex items-start gap-2 border border-red-100 animate-bubble">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Thread ID</label>
              <input 
                name="thread_id" 
                required 
                placeholder="Ex: a1b2c3d4"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none text-slate-700"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase ml-1">Código de Pareamento</label>
              <input 
                name="pair_code" 
                required 
                placeholder="6 dígitos"
                maxLength={6}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none text-slate-700 font-mono tracking-widest text-center"
              />
            </div>
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-100 transition-all active:scale-[0.98]">
              Conectar Dispositivo
            </button>
          </form>
          
          <p className="text-center text-[10px] text-slate-400 mt-8 uppercase tracking-widest">
            BitDogLab v7 • MicroPython
          </p>
        </div>
      </div>
    );
  }

  // --- RENDER: TELA DE CHAT ---
  return (
    <div className="flex flex-col h-[100dvh] max-w-md mx-auto bg-white shadow-2xl relative">
      {/* Header */}
      <header className="shrink-0 bg-white border-b border-slate-100 px-6 py-4 flex justify-between items-center z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-slate-300'} ring-4 ring-white`}></div>
            {isOnline && <div className="absolute inset-0 w-3 h-3 rounded-full bg-green-500 animate-ping opacity-75"></div>}
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-sm leading-tight">BitDogLab</h2>
            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-tighter">ID: {creds.thread_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isOnline && <WifiOff size={16} className="text-red-400" />}
          <button 
            onClick={logout}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
            title="Sair"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Mensagens */}
      <main 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50 no-scrollbar"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-30 text-slate-500 select-none">
            <MessageSquare size={48} className="mb-4" />
            <p className="font-medium">Nenhuma mensagem ainda</p>
            <p className="text-sm">Inicie a conversa com seu dispositivo.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isWeb = msg.from === 'web';
            return (
              <div 
                key={`${msg.msg_id}-${msg.ts}`} 
                className={`flex w-full animate-bubble ${isWeb ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                    isWeb 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
                  }`}
                >
                  <p className="leading-relaxed break-words">{msg.text}</p>
                  <div className={`text-[10px] mt-1 text-right opacity-60 flex justify-end items-center gap-1`}>
                    {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {isWeb && <span className="text-[8px]">✓</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* Input de Mensagem */}
      <footer className="shrink-0 p-4 bg-white border-t border-slate-100 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
        {error && (
          <div className="text-[10px] text-red-500 mb-2 px-2 animate-bubble flex items-center gap-1">
            <AlertCircle size={10} /> {error}
          </div>
        )}
        <form onSubmit={handleSendMessage} className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Digite uma mensagem..."
              rows={1}
              maxLength={280}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              className="w-full bg-slate-100 focus:bg-white text-slate-700 rounded-2xl px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all border border-transparent resize-none block text-sm"
            />
            <div className={`absolute right-3 bottom-3 text-[9px] font-bold tracking-tighter ${inputText.length > 250 ? 'text-orange-500' : 'text-slate-400'}`}>
              {inputText.length}/280
            </div>
          </div>
          <button 
            type="submit"
            disabled={!inputText.trim() || isSending || !isOnline}
            className="bg-blue-600 text-white p-3.5 rounded-2xl hover:bg-blue-700 disabled:opacity-30 disabled:grayscale transition-all shadow-lg shadow-blue-200 active:scale-95 shrink-0"
          >
            {isSending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </form>
      </footer>
    </div>
  );
}

export default App;