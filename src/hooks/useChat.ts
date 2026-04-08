import { useCallback } from 'react';
import { useChatStore } from '../store/chatStore';
import { api, ApiError } from '../api/client';
import type { CardPayload } from '../types/cards';

let counter = 0;
const nextId = () => {
  counter += 1;
  return `${Date.now()}-${counter}`;
};

const HISTORY_LIMIT = 10;

/**
 * Flattens our card-based message history into the plain { role, content }
 * shape Claude expects. Uses the first text card as the body, with a hint
 * about additional cards so the AI knows what was rendered.
 */
function buildHistory(messages: { role: 'user' | 'ai'; cards: CardPayload[] }[]) {
  return messages.slice(-HISTORY_LIMIT).map((m) => {
    const textCard = m.cards.find((c) => c.kind === 'text') as { kind: 'text'; text: string } | undefined;
    const otherKinds = m.cards.filter((c) => c.kind !== 'text').map((c) => c.kind);
    let content = textCard?.text ?? '';
    if (otherKinds.length > 0) {
      content += `\n[also rendered: ${otherKinds.join(', ')}]`;
    }
    if (!content) content = m.cards.map((c) => c.kind).join(', ');
    return {
      role: m.role === 'ai' ? ('assistant' as const) : ('user' as const),
      content,
    };
  });
}

export const useChat = () => {
  const addMessage = useChatStore((s) => s.addMessage);
  const setTyping = useChatStore((s) => s.setTyping);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      // Snapshot history BEFORE we add the new user message — Claude already
      // gets the new message via the `userMessage` field; history should be
      // the prior turns only.
      const history = buildHistory(useChatStore.getState().messages);

      addMessage({
        id: nextId(),
        role: 'user',
        cards: [{ kind: 'text', text }],
        createdAt: Date.now(),
      });
      setTyping(true);

      // Auto-create a session if none is active so every conversation is tracked
      let sessionId = useChatStore.getState().sessionId ?? undefined;
      if (!sessionId) {
        try {
          const { session } = await api.createSession(text);
          sessionId = session.id;
          useChatStore.getState().setSessionId(session.id);
          useChatStore.getState().addSession({
            id: session.id,
            title: session.title,
            createdAt: session.createdAt,
            messageCount: 0,
          });
        } catch { /* fall through without session */ }
      }

      let cards: CardPayload[];
      try {
        const res = await api.chat(text, history, sessionId);
        if (!res.cards || res.cards.length === 0) {
          cards = [{ kind: 'error', text: 'AI returned an empty response. Please try again.' }];
        } else {
          cards = res.cards;
        }
      } catch (err) {
        const detail =
          err instanceof ApiError && err.detail
            ? err.detail
            : err instanceof Error
              ? err.message
              : 'unknown error';
        cards = [{ kind: 'error', text: `Connection error: ${detail}` }];
      }

      addMessage({
        id: nextId(),
        role: 'ai',
        cards,
        createdAt: Date.now(),
      });
      setTyping(false);
    },
    [addMessage, setTyping],
  );

  return { send };
};
