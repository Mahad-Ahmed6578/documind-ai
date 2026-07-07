"use client";

// ============================================================
// MarkdownRenderer — renders assistant messages as proper
// markdown (headings, bold, lists, tables, code, math)
// ============================================================

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

interface MarkdownRendererProps {
  content: string;
  /** When true, text is light (for user bubbles on dark background) */
  variant?: "user" | "assistant";
}

export function MarkdownRenderer({
  content,
  variant = "assistant",
}: MarkdownRendererProps) {
  const isUser = variant === "user";

  return (
    <div className={isUser ? "markdown-user" : "markdown-assistant"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Headings
          h1: ({ node, ...props }) => (
            <h3 className="mb-2 mt-3 text-base font-bold first:mt-0" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h3 className="mb-2 mt-3 text-sm font-bold first:mt-0" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h4 className="mb-1.5 mt-2 text-sm font-semibold first:mt-0" {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h5 className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide first:mt-0" {...props} />
          ),
          // Paragraphs
          p: ({ node, ...props }) => (
            <p className="mb-2 leading-relaxed last:mb-0" {...props} />
          ),
          // Bold
          strong: ({ node, ...props }) => (
            <strong className="font-bold" {...props} />
          ),
          // Italic
          em: ({ node, ...props }) => (
            <em className="italic" {...props} />
          ),
          // Lists
          ul: ({ node, ...props }) => (
            <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),
          // Code
          code: ({ node, className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className={`rounded px-1 py-0.5 text-[0.85em] font-mono ${
                    isUser
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={`block font-mono ${className ?? ""}`} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ node, ...props }) => (
            <pre
              className={`mb-2 overflow-x-auto rounded-md p-2.5 text-xs last:mb-0 ${
                isUser ? "bg-primary-foreground/15" : "bg-muted"
              }`}
              {...props}
            />
          ),
          // Tables
          table: ({ node, ...props }) => (
            <div className="mb-2 overflow-x-auto last:mb-0">
              <table
                className="w-full border-collapse text-xs"
                {...props}
              />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead
              className={isUser ? "border-b border-primary-foreground/30" : "border-b"}
              {...props}
            />
          ),
          th: ({ node, ...props }) => (
            <th
              className={`px-2 py-1 text-left font-semibold ${
                isUser ? "text-primary-foreground" : "text-foreground"
              }`}
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td
              className={`px-2 py-1 ${
                isUser ? "border-primary-foreground/20" : "border-border"
              } border-b`}
              {...props}
            />
          ),
          // Blockquote
          blockquote: ({ node, ...props }) => (
            <blockquote
              className={`mb-2 border-l-2 pl-3 italic last:mb-0 ${
                isUser ? "border-primary-foreground/40" : "border-primary"
              }`}
              {...props}
            />
          ),
          // Horizontal rule
          hr: ({ node, ...props }) => (
            <hr
              className={`my-3 border-t ${
                isUser ? "border-primary-foreground/30" : "border-border"
              }`}
              {...props}
            />
          ),
          // Links
          a: ({ node, ...props }) => (
            <a
              className="underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
