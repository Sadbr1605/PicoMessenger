import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, LogOut, Loader2, Wifi, Smartphone } from 'lucide-react';
import { Message, Credentials } from './types';

// IMPORTANT: Replace this with your deployed Cloud Function URL
// e.g., https://us-central1-YOUR-PROJECT.cloudfunctions.net/api
// Fix: Suppress TypeScript error for missing 'env' on import.meta
// @ts-ignore
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/YOUR_PROJECT_ID/us-central1/api';

function App() {
  const [creds, setCreds] = useState<Credentials | null>(() => {
    const saved = localStorage.getItem('pico_creds');
    return saved ? JSON.parse(saved) : null;
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [latestId, setLatestId] = useState(0);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  
  // Refs for auto-scrolling
  const endRef = useRef<HTMLDivElement>(null);

  // Login Handler
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const thread_id = formData.get('thread_id') as string;
    const pair_code = formData.get('pair_code') as string;

    if (thread_id && pair_code) {
      const newCreds = { thread_id: thread_id.trim(), pair_code: pair_code.trim() };
      setCreds(newCreds);
      localStorage.setItem('pico_creds', JSON.stringify(newCreds));
      setError('');
      // Reset state
      setMessages([]);
      setLatestId(0);
    }
  };

  const logout = () => {
    setCreds(null);
    localStorage.removeItem('pico_creds');
    setMessages([]);
    setLatestId(0);
  };

  // Polling Logic
  const fetchMessages = useCallback(async () => {
    if (!creds) return;
    try {
      const params = new URLSearchParams({
        thread_id: creds.thread_id,
        pair_code: creds.pair_code,
        after: latestId.toString()
      });

      const res = await fetch(`${API_URL}/web_pull?${params}`);
      
      if (res.status === 403) {
        logout();
        setError("Invalid credentials. Please pair again.");
        return;
      }
      
      if (!res.ok) throw new Error('Network error');

      const data = await res.json();
      
      if (data.msgs && data.msgs.length > 0) {
        setMessages(prev => {
          // Deduplicate based on msg_id just in case
          const newMsgs = [...prev];
          data.msgs.forEach((m: Message) => {
            if (!newMsgs.find(ex => ex.msg_id === m.msg_id)) {
              newMsgs.push(m);
            }
          });
          return newMsgs.sort((a, b) => a.msg_id - b.msg_id);
        });
        setLatestId(data.latest);
      }
    } catch (e) {
      console.error("Polling error", e);
    }
  }, [creds, latestId]);

  // Polling Interval
  useEffect(() => {
    if (!creds) return;
    // Initial fetch
    fetchMessages();
    const interval = setInterval(fetchMessages, 2000);
    return () => clearInterval(interval);
  }, [creds, fetchMessages]);

  // Scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send Message
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !creds || sending) return;

    setSending(true);
    try {
      const res = await fetch(`${API_URL}/web_send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: creds.thread_id,
          pair_code: creds.pair_code,
          text: inputText
        })
      });

      if (!res.ok) throw new Error("Failed to send");

      setInputText('');
      // Trigger immediate fetch to see own message faster
      fetchMessages(); 
    } catch (e) {
      alert("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  if (!creds) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
          <div className="flex justify-center mb-6 text-blue-600">
            <Wifi size={48} />
          </div>
          <h1 className="text-2xl font-bold text-center mb-2">Connect to Pico</h1>
          <p className="text-gray-500 text-center mb-6">Enter the credentials displayed on your device's OLED screen.</p>
          
          {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Thread ID</label>
              <input 
                name="thread_id" 
                required 
                placeholder="e.g. a1b2c3d4"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pair Code</label>
              <input 
                name="pair_code" 
                required 
                type="text" 
                pattern="[0-9]*" 
                inputMode="numeric"
                placeholder="6-digit code"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition">
              Connect
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] max-w-2xl mx-auto bg-white shadow-xl">
      {/* Header */}
      <header className="bg-white border-b p-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <div>
            <h2 className="font-bold text-gray-800">Pico W Device</h2>
            <p className="text-xs text-gray-400 font-mono">ID: {creds.thread_id}</p>
          </div>
        </div>
        <button onClick={logout} className="text-gray-500 hover:text-red-500">
          <LogOut size={20} />
        </button>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-10">
            <Smartphone className="mx-auto mb-2 opacity-20" size={48} />
            <p>No messages yet.</p>
            <p className="text-sm">Send a message to start!</p>
          </div>
        )}
        
        {messages.map((msg) => {
          const isMe = msg.from === 'web';
          return (
            <div key={`${msg.msg_id}-${msg.ts}`} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                  isMe 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-white text-gray-800 border rounded-tl-none'
                }`}
              >
                <p>{msg.text}</p>
                <p className={`text-[10px] mt-1 text-right ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
                   {new Date(msg.ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </main>

      {/* Input Area */}
      <footer className="bg-white border-t p-3">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={280}
          />
          <button 
            disabled={sending || !inputText.trim()}
            className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {sending ? <Loader2 className="animate-spin" size={20}/> : <Send size={20} />}
          </button>
        </form>
      </footer>
    </div>
  );
}

export default App;