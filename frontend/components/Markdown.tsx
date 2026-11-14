import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders model-written markdown (bold, code, lists, tables) in the app's type.
 *
 * Model output can quote attacker-controlled emails, so links render as plain
 * text and images as their alt text: nothing in it is clickable or fetched.
 * Raw HTML is never rendered (react-markdown's default).
 */
const components: Components = {
  p: ({ children }) => <p className="[&:not(:first-child)]:mt-2">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded-xs bg-raised px-1 py-px font-mono text-[0.9em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mt-2 overflow-x-auto rounded-xs bg-raised p-2 font-mono text-[0.9em] [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  h1: ({ children }) => <p className="mt-3 font-semibold text-text first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="mt-3 font-semibold text-text first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="mt-3 font-semibold text-text first:mt-0">{children}</p>,
  h4: ({ children }) => <p className="mt-3 font-semibold text-text first:mt-0">{children}</p>,
  blockquote: ({ children }) => (
    <blockquote className="mt-2 border-l-2 border-line pl-3 text-dim">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-line" />,
  table: ({ children }) => (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[0.9em]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-line px-2 py-1 font-semibold text-text">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-line/60 px-2 py-1 align-top">{children}</td>,
  a: ({ children, href }) => (
    <span className="underline decoration-dim underline-offset-2" title={href}>
      {children}
    </span>
  ),
  img: ({ alt }) => <span className="text-dim">{alt ? `[image: ${alt}]` : "[image]"}</span>,
};

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text.trim()}
      </ReactMarkdown>
    </div>
  );
}
