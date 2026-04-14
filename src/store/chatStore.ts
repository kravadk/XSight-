import { create } from 'zustand';
import type { CardPayload } from '../types/cards';
import type { SessionMeta } from '../api/client';

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  cards: CardPayload[];
  createdAt: number;
}

interface ChatState {
  sessionId: string | null;
  sessions: SessionMeta[];
  messages: ChatMessage[];
  typing: boolean;
  setSessionId: (id: string | null) => void;
  setSessions: (s: SessionMeta[]) => void;
  addSession: (s: SessionMeta) => void;
  removeSession: (id: string) => void;
  addMessage: (m: ChatMessage) => void;
  loadMessages: (messages: ChatMessage[]) => void;
  setTyping: (t: boolean) => void;
  replaceMessage: (id: string, m: ChatMessage) => void;
  updateSession: (id: string, updates: { title?: string; messageCount?: number; lastMessage?: string }) => void;
  clear: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  sessionId: null,
  sessions: [],
  messages: [],
  typing: false,
  setSessionId: (id) => set({ sessionId: id }),
  setSessions:  (s)  => set({ sessions: s }),
  addSession:   (s)  => set((st) => ({ sessions: [s, ...st.sessions] })),
  removeSession: (id) => set((st) => ({ sessions: st.sessions.filter(s => s.id !== id) })),
  addMessage:   (m)  => set((s) => ({ messages: [...s.messages, m] })),
  loadMessages: (messages) => set({ messages }),
  setTyping:    (t)  => set({ typing: t }),
  replaceMessage: (id, m) =>
    set((s) => ({ messages: s.messages.map((x) => (x.id === id ? m : x)) })),
  updateSession: (id, updates) =>
    set((st) => ({
      sessions: st.sessions.map(s => s.id === id ? { ...s, ...updates } : s),
    })),
  clear: () => set({ messages: [], sessionId: null }),
}));
