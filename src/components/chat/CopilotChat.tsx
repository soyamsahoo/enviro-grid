import { useEffect, useRef, useState } from "react";
import { Bot, MessageSquare, Send, Sparkles, X } from "lucide-react";
import type { AggregatePayload } from "@/lib/types";
import type { PersonaId } from "@/lib/ai/personas";
import { copilotChat } from "@/lib/ai/copilot";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

const SUGGESTIONS = [
  "Is it safe to train outdoors right now?",
  "Should I turn on the air purifier?",
  "Can I take my dog for a walk this evening?",
  "What is the main health risk here today?",
];

export default function CopilotChat({
  payload,
  persona,
}: {
  payload: AggregatePayload | null;
  persona: PersonaId;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    if (!payload) {
      setMessages((m) => [
        ...m,
        { role: "user", content: question },
        { role: "assistant", content: "No live data for this location yet — wait for the feeds to load and try again.", error: true },
      ]);
      setInput("");
      return;
    }

    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    try {
      const answer = await copilotChat(payload, persona, question);
      setMessages((m) => [...m, { role: "assistant", content: answer }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `The AI copilot is unavailable (${err instanceof Error ? err.message : "error"}). Add VITE_LLM_API_KEY to .env to enable chat.`,
          error: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 shadow-2xl backdrop-blur transition-transform hover:scale-105 neo-glow-emerald"
        title="Ask the AI copilot"
      >
        {open ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[540px] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-grid-border bg-grid-panel/95 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-2 border-b border-grid-border bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15">
              <Bot className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-100">ENVIROGRID Copilot</div>
              <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-emerald-400">
                <Sparkles className="h-2.5 w-2.5" />
                Live data grounded · {persona}
              </div>
            </div>
          </div>

          <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="space-y-2">
                <div className="rounded-xl rounded-tl-sm bg-secondary/70 px-3 py-2.5 text-xs text-slate-300">
                  Ask anything about this location — I answer from the live
                  measurement payload (AQI, PM2.5, UV, fires, species…), persona-aware.
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-grid-border px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "ml-auto rounded-tr-sm bg-emerald-500/15 text-emerald-100"
                    : cn(
                        "rounded-tl-sm bg-secondary/70 text-slate-200",
                        m.error && "border border-red-500/30 text-red-300",
                      ),
                )}
              >
                {m.content}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Analyzing live feeds…
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="border-t border-grid-border p-3"
          >
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. Should I run at 6 PM today?"
                className="flex-1 rounded-lg border border-grid-border bg-grid-panel2 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 transition-colors hover:bg-emerald-500/30 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}