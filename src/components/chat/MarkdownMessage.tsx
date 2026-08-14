import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Recursively extract plain text from React children (for code copy). */
function textFromChildren(children: ReactNode): string {
  if (children === null || children === undefined) return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textFromChildren).join("");
  if (typeof children === "object" && "props" in (children as React.ReactElement)) {
    const props = (children as React.ReactElement).props;
    return textFromChildren(props.children);
  }
  return "";
}

function CodeBlock({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const code = textFromChildren(children);
  const isBlock = typeof className === "string" && className.includes("language-");

  if (!isBlock) {
    return (
      <code className="mx-0.5 rounded-md border border-grid-border bg-slate-950/70 px-1.5 py-0.5 font-mono text-[0.85em] text-emerald-300">
        {children}
      </code>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="group/code relative my-3">
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-grid-border bg-slate-950/90 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          {className?.replace(/^language-/, "") ?? "code"}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] text-slate-500 transition-colors hover:bg-slate-800 hover:text-emerald-300"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="scrollbar-thin overflow-x-auto rounded-b-lg border border-grid-border bg-slate-950/90 p-3 text-[12px] leading-relaxed text-slate-200">
        {children}
      </pre>
    </div>
  );
}

export default function MarkdownMessage({
  content,
  error,
}: {
  content: string;
  error?: boolean;
}) {
  return (
    <div
      className={cn(
        "chat-md space-y-0.5 text-[13px] leading-relaxed",
        error ? "text-red-300 [&_strong]:text-red-200" : "text-slate-200",
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
        code: (props) => (
          <CodeBlock className={props.className}>{props.children}</CodeBlock>
        ),
        p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
        strong: ({ children }) => (
          <strong className="font-semibold text-slate-100">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        h1: ({ children }) => (
          <h1 className="mb-1.5 mt-3 text-base font-bold text-emerald-300 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-1.5 mt-3 text-[15px] font-bold text-emerald-300 first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1.5 mt-2.5 text-sm font-bold text-emerald-300 first:mt-0">{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="mb-1 mt-2 text-[13px] font-semibold text-emerald-300 first:mt-0">{children}</h4>
        ),
        ul: ({ children }) => (
          <ul className="my-1.5 list-disc space-y-1 pl-5 marker:text-emerald-400">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-1.5 list-decimal space-y-1 pl-5 marker:text-emerald-400">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-emerald-500/50 pl-3 text-slate-400">
            {children}
          </blockquote>
        ),
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-400 underline decoration-emerald-500/40 underline-offset-2 hover:decoration-emerald-400"
          >
            {children}
          </a>
        ),
        hr: () => <hr className="my-3 border-grid-border" />,
        table: ({ children }) => (
          <div className="scrollbar-thin my-2 overflow-x-auto rounded-lg border border-grid-border">
            <table className="w-full border-collapse text-left text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-slate-950/70 text-slate-300">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="border-b border-grid-border px-2.5 py-1.5 font-semibold">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border-b border-grid-border/60 px-2.5 py-1.5 text-slate-300">{children}</td>
        ),
        input: (props) => (
          <input
            {...props}
            disabled={!props.checked}
            className="accent-emerald-500"
          />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}