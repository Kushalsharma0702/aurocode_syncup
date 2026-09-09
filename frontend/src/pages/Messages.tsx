import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Spinner from "../components/Spinner";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ChatMessage, ChatThread } from "../types";

export default function Messages() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [selectedClient, setSelectedClient] = useState<number | null>(null);

  if (!isAdmin) {
    return (
      <div className="mx-auto flex h-[calc(100dvh-10rem)] max-w-3xl flex-col">
        <PageHeader
          title="Messages"
          subtitle="Direct line to your project team — replies land right here."
        />
        <Conversation clientId={null} title="Aurocode Team" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col">
      <PageHeader title="Messages" subtitle="Chat with your clients." />
      <div className="card flex min-h-0 flex-1 overflow-hidden">
        <ThreadList selected={selectedClient} onSelect={setSelectedClient} />
        <div className={`min-w-0 flex-1 flex-col ${selectedClient === null ? "hidden md:flex" : "flex"}`}>
          {selectedClient === null ? (
            <div className="flex flex-1 items-center justify-center text-sm text-ink4">
              Select a client to start chatting.
            </div>
          ) : (
            <Conversation
              clientId={selectedClient}
              onBack={() => setSelectedClient(null)}
              embedded
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-ink3">{subtitle}</p>
    </div>
  );
}

function ThreadList({
  selected,
  onSelect,
}: {
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const { data: threads, isLoading } = useQuery({
    queryKey: ["chat", "threads"],
    queryFn: () => api.get<ChatThread[]>("/chat/threads").then((r) => r.data),
    refetchInterval: 10_000,
  });

  return (
    <div
      className={`w-full shrink-0 overflow-y-auto border-line md:w-72 md:border-r ${
        selected !== null ? "hidden md:block" : ""
      }`}
    >
      {isLoading ? (
        <Spinner />
      ) : !threads || threads.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink4">
          No clients yet. Create one from the Clients page.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {threads.map((thread) => (
            <li key={thread.client.id}>
              <button
                onClick={() => onSelect(thread.client.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 ${
                  selected === thread.client.id ? "bg-muted/70" : ""
                }`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold text-brand">
                  {thread.client.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-ink">{thread.client.full_name}</p>
                    {thread.unread > 0 && (
                      <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-bold text-brand-fg">
                        {thread.unread}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-ink4">
                    {thread.last_message
                      ? `${thread.last_message.sender.role === "admin" ? "You: " : ""}${thread.last_message.body}`
                      : "No messages yet"}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Conversation({
  clientId,
  title,
  onBack,
  embedded,
}: {
  clientId: number | null; // null → client talking in their own thread
  title?: string;
  onBack?: () => void;
  embedded?: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const params = clientId !== null ? { client_id: clientId } : {};
  const { data: messages, isLoading } = useQuery({
    queryKey: ["chat", "messages", clientId],
    queryFn: () => api.get<ChatMessage[]>("/chat/messages", { params }).then((r) => r.data),
    refetchInterval: 4_000,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      api.post("/chat/messages", clientId !== null ? { body, client_id: clientId } : { body }),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["chat"] });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (body) sendMutation.mutate(body);
  };

  const container = embedded ? "flex min-h-0 flex-1 flex-col" : "card flex min-h-0 flex-1 flex-col";

  return (
    <div className={container}>
      {(title || onBack) && (
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          {onBack && (
            <button onClick={onBack} className="rounded-lg p-1 text-ink3 hover:bg-muted md:hidden" aria-label="Back">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <p className="text-sm font-semibold text-ink">{title ?? "Conversation"}</p>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading ? (
          <Spinner />
        ) : !messages || messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink4">No messages yet — say hello!</p>
        ) : (
          messages.map((message) => {
            const own = message.sender.id === user?.id;
            return (
              <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                    own
                      ? "rounded-br-md bg-brand text-brand-fg"
                      : "rounded-bl-md bg-muted text-ink"
                  }`}
                >
                  <p className="whitespace-pre-line break-words text-sm leading-relaxed">{message.body}</p>
                  <p className={`mt-1 text-right text-[10px] ${own ? "text-brand-fg/70" : "text-ink4"}`}>
                    {new Date(message.created_at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-line p-3">
        <input
          className="input"
          placeholder="Type a message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={5000}
        />
        <button type="submit" className="btn-primary shrink-0 !px-3" disabled={sendMutation.isPending || !draft.trim()} aria-label="Send">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </form>
    </div>
  );
}
