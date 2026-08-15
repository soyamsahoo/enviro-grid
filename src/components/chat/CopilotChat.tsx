import { useEffect, useRef, useState } from "react";
import { Bot, MessageSquare, Send, Sparkles, User, X } from "lucide-react";
import type { AggregatePayload } from "@/lib/types";
import type { PersonaId } from "@/lib/ai/personas";
import { copilotChat, type CopilotChatExtras } from "@/lib/ai/copilot";
import MarkdownMessage from "./MarkdownMessage";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  time: number;
}

const SUGGESTIONS = [
  "Is it safe to train outdoors right now?",
  "Should I turn on the air purifier?",
  "Can I take my dog for a walk this evening?",
  "What is the main health risk here today?",
];

let messageId = 0;

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CopilotChat({
  payload,
  persona,
  context,
}: {
  payload: AggregatePayload | null;
  persona: PersonaId;
  context?: CopilotChatExtras;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open]);

  const pushMessage = (msg: Omit<ChatMessage, "id" | "time">) => {
    setMessages((m) => [...m, { ...msg, id: ++messageId, time: Date.now() }]);
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;

    if (!payload) {
      pushMessage({ role: "user", content: question });
      setInput("");
      pushMessage({
        role: "assistant",
        content:
          "No live data for this location yet — wait for the feeds to load and try again.",
        error: true,
      });
      return;
    }

    pushMessage({ role: "user", content: question });
    setInput("");
    inputRef.current?.style.setProperty("height", "auto");
    setBusy(true);
    try {
      const answer = await copilotChat(payload, persona, question, context);
      pushMessage({ role: "assistant", content: answer });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      const friendly = /429/.test(msg)
        ? "The AI provider is rate-limited right now (429). Wait a minute and retry, or check your quota."
        : `The AI copilot is unavailable: ${msg}${
            /LLM_API_KEY/.test(msg) || /401|403/.test(msg)
              ? " — check LLM_API_KEY (VITE_LLM_API_KEY in .env, LLM_API_KEY on Vercel)."
              : ""
          }`;
      pushMessage({ role: "assistant", content: friendly, error: true });
    } finally {
      setBusy(false);
    }
  };

  const autoResize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 shadow-2xl backdrop-blur transition-all hover:scale-105 hover:bg-emerald-500/30 active:scale-95 neo-glow-emerald"
        title="Ask the AI copilot"
        aria-label="Toggle AI copilot chat"
      >
        {open ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
        {!open && messages.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="chat-panel fixed bottom-24 right-5 z-50 flex h-[min(600px,calc(100dvh-8rem))] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-grid-border bg-grid-panel/95 shadow-2xl backdrop-blur">
          {/* Header */}
          <div className="flex items-center gap-2.5 border-b border-grid-border bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 px-4 py-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15">
              <Bot className="h-5 w-5 text-emerald-400" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-grid-panel bg-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-100">ENVIROGRID Copilot</div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-emerald-400">
                <Sparkles className="h-2.5 w-2.5" />
                <span className="truncate">Live data grounded · {persona}</span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-secondary/60 hover:text-slate-200"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="chat-enter space-y-3">
                <div className="rounded-xl rounded-tl-sm bg-secondary/70 px-3.5 py-3 text-xs leading-relaxed text-slate-300">
                  Ask anything about this location — I answer from the live
                  measurement payload (AQI, PM2.5, UV, fires, species…), persona-aware.
                  <span className="mt-1.5 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Markdown · LaTeX math ($x^2$, $$…$$) supported
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => void send(s)}
                      disabled={busy}
                      className="rounded-full border border-grid-border px-2.5 py-1 text-[11px] text-slate-400 transition-all hover:-translate-y-px hover:border-emerald-500/40 hover:bg-emerald-500/5 hover:text-emerald-300 disabled:opacity-40"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "chat-enter flex items-end gap-2",
                  m.role === "user" && "flex-row-reverse",
                )}
              >
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    m.role === "user"
                      ? "bg-cyan-500/15 text-cyan-300"
                      : "bg-emerald-500/15 text-emerald-400",
                  )}
                >
                  {m.role === "user" ? (
                    <User className="h-3.5 w-3.5" />
                  ) : (
                    <Bot className="h-3.5 w-3.5" />
                  )}
                </div>
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                    m.role === "user"
                      ? "rounded-tr-sm bg-emerald-500/15 text-emerald-100"
                      : cn(
                          "rounded-tl-sm bg-secondary/70",
                          m.error
                            ? "border border-red-500/30 bg-red-500/5"
                            : "border border-grid-border/50",
                        ),
                  )}
                >
                  {m.role === "assistant" ? (
                    <MarkdownMessage content={m.content} error={m.error} />
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  )}
                  <div
                    className={cn(
                      "mt-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest",
                      m.error ? "text-red-400/70" : "text-slate-600",
                    )}
                  >
                    {m.role === "assistant" && !m.error && (
                      <Sparkles className="h-2 w-2" />
                    )}
                    {formatTime(m.time)}
                  </div>
                </div>
              </div>
            ))}

            {busy && (
              <div className="chat-enter flex items-end gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-2 rounded-xl rounded-tl-sm border border-grid-border/50 bg-secondary/70 px-3.5 py-2.5">
                  <span className="flex items-center gap-1">
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-emerald-400 [animation-delay:0.15s]" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-emerald-400 [animation-delay:0.3s]" />
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Analyzing live feeds
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="border-t border-grid-border p-3"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoResize();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                placeholder="e.g. Should I run at 6 PM today?"
                className="scrollbar-thin max-h-28 min-h-[38px] flex-1 resize-none rounded-lg border border-grid-border bg-grid-panel2 px-3 py-2 text-sm leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/10"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 transition-all hover:bg-emerald-500/30 hover:shadow-[0_0_12px_rgba(16,185,129,0.25)] active:scale-90 disabled:pointer-events-none disabled:opacity-40"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-center font-mono text-[9px] uppercase tracking-widest text-slate-600">
              Enter to send · Shift+Enter for a new line
            </p>
          </form>
        </div>
      )}
    </>
  );
}