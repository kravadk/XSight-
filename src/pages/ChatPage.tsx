import { useEffect, useRef, useState, useCallback } from 'react';
import { ScrollText, Trash2, Plus, MessageSquare, X } from 'lucide-react';
import { MessageBubble } from '../components/chat/MessageBubble';
import { ChatInput } from '../components/chat/ChatInput';
import { EmptyChat } from '../components/chat/EmptyChat';
import { ChatCard } from '../components/chat/ChatCard';
import { AuditModal } from '../components/chat/AuditModal';
import { useChatStore } from '../store/chatStore';
import { api } from '../api/client';
import type { SessionMeta } from '../api/client';
import { motion } from 'motion/react';

export function ChatPage() {
  const messages    = useChatStore((s) => s.messages);
  const typing      = useChatStore((s) => s.typing);
  const sessionId   = useChatStore((s) => s.sessionId);
  const sessions    = useChatStore((s) => s.sessions);
  const clear       = useChatStore((s) => s.clear);
  const loadMessages  = useChatStore((s) => s.loadMessages);
  const setSessionId  = useChatStore((s) => s.setSessionId);
  const setSessions   = useChatStore((s) => s.setSessions);
  const addSession    = useChatStore((s) => s.addSession);
  const removeSession = useChatStore((s) => s.removeSession);

  const scrollRef  = useRef<HTMLDivElement>(null);
  const [auditOpen, setAuditOpen] = useState(false);

  // Load sessions list on mount, then auto-select most recent
  useEffect(() => {
    api.listSessions()
      .then(({ sessions: list }) => {
        setSessions(list);
        if (list.length > 0 && !sessionId) {
          const first = list[0];
          setSessionId(first.id);
          api.loadSession(first.id)
            .then(({ messages: msgs }) => { if (msgs.length) loadMessages(msgs); })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewChat = useCallback(async () => {
    try {
      const { session } = await api.createSession();
      addSession({ id: session.id, title: session.title, createdAt: session.createdAt, messageCount: 0 });
      setSessionId(session.id);
      clear();
    } catch { /* ignore */ }
  }, [addSession, setSessionId, clear]);

  const handleSelectSession = useCallback(async (id: string) => {
    if (id === sessionId) return;
    setSessionId(id);
    clear();
    try {
      const { messages: msgs } = await api.loadSession(id);
      if (msgs.length) loadMessages(msgs);
    } catch { /* ignore */ }
  }, [sessionId, setSessionId, clear, loadMessages]);

  const handleDeleteSession = useCallback(async (_e: React.MouseEvent, id: string) => {
    try {
      await api.deleteSession(id);
      removeSession(id);
      if (id === sessionId) {
        // switch to next available session
        const remaining = sessions.filter((s: SessionMeta) => s.id !== id);
        if (remaining.length > 0) {
          const next = remaining[0];
          setSessionId(next.id);
          clear();
          api.loadSession(next.id)
            .then(({ messages: msgs }) => { if (msgs.length) loadMessages(msgs); })
            .catch(() => {});
        } else {
          setSessionId(null);
          clear();
        }
      }
    } catch { /* ignore */ }
  }, [sessionId, sessions, removeSession, setSessionId, clear, loadMessages]);

  const handleClearChat = useCallback(() => {
    clear();
    if (sessionId) api.deleteSession(sessionId).catch(() => {});
    removeSession(sessionId ?? '');
    setSessionId(null);
  }, [clear, sessionId, removeSession, setSessionId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, typing]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-[calc(100vh-110px)] w-full gap-3">
      {/* ── Sessions sidebar ─────────────────────────────────────── */}
      <div className="w-52 shrink-0 flex flex-col gap-2 overflow-hidden">
        <button
          onClick={handleNewChat}
          className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-[rgba(167,139,250,0.12)] hover:bg-[rgba(167,139,250,0.22)] text-[#A78BFA] text-xs font-semibold transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Chat
        </button>

        <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-0.5">
          {sessions.length === 0 && (
            <p className="text-[10px] text-[#525252] text-center mt-4">No conversations yet</p>
          )}
          {sessions.map((s: SessionMeta) => {
            const active = s.id === sessionId;
            return (
              <button
                key={s.id}
                onClick={() => handleSelectSession(s.id)}
                className={`group w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                  active
                    ? 'bg-[rgba(167,139,250,0.15)] text-[#E8E8E8]'
                    : 'bg-transparent hover:bg-[rgba(255,255,255,0.04)] text-[#A3A3A3] hover:text-[#E8E8E8]'
                }`}
              >
                <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 opacity-60" />
                <span className="flex-1 text-[11px] leading-tight line-clamp-2 break-words">
                  {s.title}
                </span>
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); void handleDeleteSession(e as React.MouseEvent, s.id); }}
                  className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-[#EF4444] transition-opacity mt-0.5"
                >
                  <X className="w-3 h-3" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main chat area ──────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {hasMessages && (
          <div className="flex items-center justify-end gap-1 mb-2 px-1">
            <button
              onClick={() => setAuditOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] text-[#A3A3A3] hover:text-[#F5F5F5] text-[10px] font-bold uppercase tracking-wider"
            >
              <ScrollText className="w-3 h-3" /> Audit
            </button>
            <button
              onClick={handleClearChat}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(239,68,68,0.1)] text-[#A3A3A3] hover:text-[#EF4444] text-[10px] font-bold uppercase tracking-wider"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto pb-4 flex flex-col gap-6 px-1">
          {!hasMessages ? (
            <EmptyChat />
          ) : (
            <>
              {messages.map((m) => (
                <MessageBubble key={m.id} isAi={m.role === 'ai'}>
                  <div className="flex flex-col gap-3">
                    {m.cards.map((c, i) => (
                      <ChatCard key={i} card={c} />
                    ))}
                  </div>
                </MessageBubble>
              ))}
              {typing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-[#A3A3A3] text-xs ml-11"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse [animation-delay:120ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse [animation-delay:240ms]" />
                  <span>XSight is thinking...</span>
                </motion.div>
              )}
            </>
          )}
        </div>

        <ChatInput />
      </div>

      <AuditModal open={auditOpen} onClose={() => setAuditOpen(false)} />
    </div>
  );
}
