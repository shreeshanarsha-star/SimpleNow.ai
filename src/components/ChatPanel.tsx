"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberDisplayName, parseMentions, splitMentions, type ChatMember } from "@/lib/chat";
import Icon from "./Icon";
import { VScroller } from "./Scroller";

interface Channel {
  id: string;
  name: string;
  description: string | null;
}

interface Message {
  id: string;
  body: string;
  user_id: string;
  mentioned_user_ids: string[];
  created_at: string;
  senderName?: string;
}

interface MemberRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

export default function ChatPanel({ meId }: { meId: string }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatMembers: ChatMember[] = useMemo(
    () => members.map((m) => ({ id: m.id, displayName: memberDisplayName(m) })),
    [members]
  );
  const nameById = useMemo(() => new Map(chatMembers.map((m) => [m.id, m.displayName])), [chatMembers]);

  // Initial load: channels + org roster. Picks up a ?channel= deep link
  // from a mention notification, if present.
  useEffect(() => {
    (async () => {
      setLoadingChannels(true);
      const [chRes, memRes] = await Promise.all([
        fetch("/api/chat/channels").then((r) => r.json()),
        fetch("/api/chat/members").then((r) => r.json()),
      ]);
      const loadedChannels: Channel[] = chRes.channels ?? [];
      setChannels(loadedChannels);
      setMembers(memRes.members ?? []);
      setLoadingChannels(false);

      const deepLinked = new URLSearchParams(window.location.search).get("channel");
      const initial =
        (deepLinked && loadedChannels.find((c) => c.id === deepLinked)?.id) ??
        loadedChannels[0]?.id ??
        null;
      setSelectedId(initial);
    })();
  }, []);

  // Messages + realtime subscription for the selected channel.
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    fetch(`/api/chat/channels/${selectedId}/messages`)
      .then((r) => r.json())
      .then((data) => setMessages(data.messages ?? []))
      .finally(() => setLoadingMessages(false));

    const supabase = createClient();
    const channel = supabase
      .channel(`chat-messages-${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${selectedId}` },
        (payload) => {
          const row = payload.new as Omit<Message, "senderName">;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, { ...row, senderName: nameById.get(row.user_id) ?? "Member" }];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleCreateChannel(e: React.FormEvent) {
    e.preventDefault();
    const name = newChannelName.trim();
    if (!name) return;
    setError(null);
    const res = await fetch("/api/chat/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not create channel.");
      return;
    }
    setChannels((prev) => [...prev, data.channel].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedId(data.channel.id);
    setNewChannelName("");
    setShowNewChannel(false);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !text.trim() || sending) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/chat/channels/${selectedId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text.trim() }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      setError(data.error || "Could not send message.");
      return;
    }
    setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
    setText("");
    setMentionQuery(null);
  }

  function handleTextChange(value: string) {
    setText(value);
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const upToCursor = value.slice(0, cursor);
    const match = upToCursor.match(/@([^\s@]*)$/);
    setMentionQuery(match ? match[1] : null);
  }

  function insertMention(member: ChatMember) {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? text.length;
    const upToCursor = text.slice(0, cursor);
    const match = upToCursor.match(/@([^\s@]*)$/);
    if (!match || match.index === undefined) return;
    const newText = `${text.slice(0, match.index)}@${member.displayName} ${text.slice(cursor)}`;
    setText(newText);
    setMentionQuery(null);
    requestAnimationFrame(() => el?.focus());
  }

  const mentionMatches = mentionQuery !== null
    ? chatMembers.filter((m) => m.displayName.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : [];

  const selectedChannel = channels.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex-1 min-h-0 flex gap-4">
      {/* Channel list */}
      <div className="w-[200px] flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Channels</span>
          <button
            type="button"
            onClick={() => setShowNewChannel((v) => !v)}
            className="text-brand text-[16px] leading-none font-bold w-5 h-5 flex items-center justify-center"
            aria-label="New channel"
            title="New channel"
          >
            +
          </button>
        </div>

        {showNewChannel && (
          <form onSubmit={handleCreateChannel} className="mb-2">
            <input
              autoFocus
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="channel-name"
              className="w-full border border-border rounded-sm px-2 py-1.5 text-[12.5px] outline-none focus:border-brand"
            />
          </form>
        )}

        <VScroller className="flex-1" trackClassName="-mx-1">
          {loadingChannels && <div className="text-[12px] text-ink-muted px-1">Loading…</div>}
          {!loadingChannels && channels.length === 0 && (
            <div className="text-[12px] text-ink-muted px-1">
              No channels yet. Create the first one above.
            </div>
          )}
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left px-2.5 py-1.5 rounded-sm text-[13px] mb-0.5 truncate ${
                c.id === selectedId ? "bg-brand-wash text-brand font-semibold" : "text-ink hover:bg-page"
              }`}
            >
              # {c.name}
            </button>
          ))}
        </VScroller>
      </div>

      {/* Thread */}
      <div className="flex-1 min-w-0 flex flex-col border border-border rounded-md overflow-hidden">
        {!selectedChannel ? (
          <div className="flex-1 flex items-center justify-center text-[13px] text-ink-muted">
            {loadingChannels ? "Loading…" : "Create a channel to get started."}
          </div>
        ) : (
          <>
            <div className="border-b border-border px-4 py-2.5">
              <div className="text-[13.5px] font-semibold text-ink"># {selectedChannel.name}</div>
              {selectedChannel.description && (
                <div className="text-[11.5px] text-ink-muted">{selectedChannel.description}</div>
              )}
            </div>

            <VScroller ref={scrollRef} className="flex-1" trackClassName="px-4 py-3 flex flex-col gap-3">
              {loadingMessages && <div className="text-[12px] text-ink-muted">Loading…</div>}
              {!loadingMessages && messages.length === 0 && (
                <div className="text-[12px] text-ink-muted">
                  No messages yet. Say hello, or @mention someone to loop them in.
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className="flex gap-2.5">
                  <div className="w-[26px] h-[26px] rounded-full bg-gradient-to-br from-brand to-brand-dark text-white text-[10.5px] font-semibold flex items-center justify-center flex-shrink-0">
                    {(m.senderName ?? nameById.get(m.user_id) ?? "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12.5px] font-semibold text-ink">
                        {m.user_id === meId ? "You" : m.senderName ?? nameById.get(m.user_id) ?? "Member"}
                      </span>
                      <span className="text-[10.5px] text-ink-muted">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="text-[13px] text-ink whitespace-pre-wrap break-words">
                      {splitMentions(m.body, chatMembers).map((seg, i) =>
                        seg.mention ? (
                          <span key={i} className="text-brand font-semibold">
                            {seg.text}
                          </span>
                        ) : (
                          <span key={i}>{seg.text}</span>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </VScroller>

            {error && (
              <div className="mx-4 mb-2 bg-critical-wash text-critical text-[12px] rounded-sm px-3 py-1.5">
                {error}
              </div>
            )}

            <form onSubmit={handleSend} className="relative border-t border-border p-3 flex items-end gap-2">
              {mentionQuery !== null && mentionMatches.length > 0 && (
                <div className="absolute bottom-full left-3 mb-1 w-56 bg-surface border border-border rounded-md shadow-soft overflow-hidden">
                  {mentionMatches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(m);
                      }}
                      className="w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-page"
                    >
                      @{m.displayName}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder={`Message #${selectedChannel.name} -- type @ to mention someone`}
                rows={1}
                className="flex-1 resize-none border border-border rounded-sm px-3 py-2 text-[13px] outline-none focus:border-brand max-h-32"
              />
              <button
                type="submit"
                disabled={sending || !text.trim()}
                className="bg-brand text-white font-bold text-[12.5px] rounded-sm px-4 py-2 disabled:opacity-50 flex-shrink-0"
              >
                <Icon name="arrowUp" className="w-[14px] h-[14px]" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
