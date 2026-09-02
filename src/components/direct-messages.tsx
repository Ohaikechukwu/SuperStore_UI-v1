"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { MessageCircle, Plus, Send } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useRealtimeEvents } from "@/lib/realtime";

type Recipient = { user_id: string; name: string; role: string };
type Conversation = { id: string; kind: string; participant_name: string; last_message_preview: string | null; last_message_at: string | null; unread_count: number };
type ConversationList = { conversations: Conversation[]; unread_count: number };
type MessageDetail = { id: string; body: string; mine: boolean; sender_name: string; created_at: string; read_at: string | null };

export default function DirectMessages({ patient = false }: { patient?: boolean }) {
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<MessageDetail[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const selected = useMemo(() => conversations.find((item) => item.id === selectedId) || null, [conversations, selectedId]);
  async function load() {
    try {
      const [conversationData, recipientData] = await Promise.all([
        api.get<ConversationList>("/api/v1/hospital/messages/conversations"),
        api.get<{ recipients: Recipient[] }>("/api/v1/hospital/messages/recipients"),
      ]);
      setConversations(conversationData.conversations);
      setRecipients(recipientData.recipients);
      const requested = searchParams.get("conversation") || "";
      setSelectedId((current) => current || (conversationData.conversations.some((item) => item.id === requested) ? requested : conversationData.conversations[0]?.id || ""));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load messages.");
    } finally { setLoading(false); }
  }

  async function loadMessages(conversationId: string) {
    if (!conversationId) { setMessages([]); return; }
    try {
      const detail = await api.get<{ messages: MessageDetail[] }>(`/api/v1/hospital/messages/conversations/${conversationId}`);
      setMessages(detail.messages);
      setConversations((items) => items.map((item) => item.id === conversationId ? { ...item, unread_count: 0 } : item));
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to open this conversation."); }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { void loadMessages(selectedId); }, [selectedId]);
  useRealtimeEvents((event) => {
    if (event.type !== "message") return;
    void load();
    if (selectedId) void loadMessages(selectedId);
  });

  async function startConversation(recipientUserId: string) {
    setError("");
    try {
      const created = await api.post<{ id: string }>("/api/v1/hospital/messages/conversations", { recipient_user_id: recipientUserId });
      await load();
      setSelectedId(created.id);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to start the conversation."); }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !body.trim()) return;
    setSending(true); setError("");
    try {
      await api.post(`/api/v1/hospital/messages/conversations/${selectedId}/messages`, { body: body.trim() });
      setBody("");
      await Promise.all([loadMessages(selectedId), load()]);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to send your message."); }
    finally { setSending(false); }
  }

  return <main className="mx-auto grid max-w-[1180px] gap-5 lg:grid-cols-[320px_1fr]">
    <aside className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5"><div className="flex items-center gap-2"><MessageCircle className="text-teal-600" size={20} /><h1 className="text-lg font-bold">Messages</h1></div><p className="mt-1 text-sm text-slate-500">{patient ? "Your assigned care team" : "Private tenant conversations"}</p></div>
      {recipients.length > 0 && <div className="border-b border-slate-100 p-3"><p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Start a conversation</p>{recipients.map((recipient) => <button key={recipient.user_id} onClick={() => void startConversation(recipient.user_id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-teal-50"><span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">{recipient.name.slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{recipient.name}</span><span className="block truncate text-xs capitalize text-slate-500">{recipient.role.replaceAll("_", " ")}</span></span><Plus size={16} className="text-teal-600" /></button>)}</div>}
      <div className="max-h-[52vh] overflow-y-auto p-3">{loading ? <p className="p-3 text-sm text-slate-500">Loading conversations…</p> : conversations.length ? conversations.map((conversation) => <button key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={`relative block w-full rounded-2xl p-3 text-left ${conversation.id === selectedId ? "bg-teal-50" : "hover:bg-slate-50"}`}><p className="truncate text-sm font-bold text-slate-900">{conversation.participant_name}</p><p className="mt-1 truncate text-xs text-slate-500">{conversation.last_message_preview || "No messages yet"}</p>{conversation.unread_count > 0 && <span className="absolute right-3 top-3 grid h-5 min-w-5 place-items-center rounded-full bg-teal-600 px-1 text-[10px] font-bold text-white">{conversation.unread_count}</span>}</button>) : <p className="p-3 text-sm text-slate-500">{patient ? "No care personnel are assigned to you yet." : "Choose a colleague to start a conversation."}</p>}</div>
    </aside>
    <section className="flex min-h-[590px] flex-col rounded-3xl border border-slate-200 bg-white shadow-sm">
      {error && <p className="m-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {selected ? <><header className="border-b border-slate-100 p-5"><p className="font-bold">{selected.participant_name}</p><p className="mt-1 text-xs capitalize text-slate-500">{selected.kind.replaceAll("_", " ")}</p></header><div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5">{messages.map((message) => <article key={message.id} className={`max-w-[82%] rounded-2xl p-3.5 ${message.mine ? "ml-auto bg-teal-700 text-white" : "bg-white text-slate-800 shadow-sm"}`}><p className={`text-[11px] font-semibold ${message.mine ? "text-teal-100" : "text-slate-400"}`}>{message.mine ? "You" : message.sender_name} · {new Date(message.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body}</p></article>)}</div><form onSubmit={send} className="border-t border-slate-100 p-4"><div className="flex gap-3"><textarea required value={body} onChange={(event) => setBody(event.target.value)} rows={2} maxLength={4000} placeholder="Write a secure message" className="min-h-12 flex-1 resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10" /><button disabled={sending} className="self-end rounded-2xl bg-teal-600 p-3 text-white disabled:opacity-60" aria-label="Send message"><Send size={19} /></button></div></form></> : <div className="grid flex-1 place-items-center p-8 text-center text-slate-500"><div><MessageCircle className="mx-auto text-slate-300" size={34} /><p className="mt-3 text-sm">Choose a conversation to read or send a message.</p></div></div>}
    </section>
  </main>;
}
