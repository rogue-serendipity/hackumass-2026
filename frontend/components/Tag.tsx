/**
 * The one badge treatment in the app: a small dot next to plain mono text.
 * No pill, no tint. Use at most one per row.
 *
 * - solid:  trusted / benign
 * - hollow: external / attack / mock (content that isn't vouched for)
 * - accent: something the user changed
 * - danger: part of a BLOCK
 */
type Tone = "solid" | "hollow" | "accent" | "danger";

const DOT: Record<Tone, string> = {
  solid: "bg-text",
  hollow: "border border-dim",
  accent: "bg-worker",
  danger: "bg-danger",
};

interface Props {
  tone: Tone;
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export function Tag({ tone, children, title, className = "" }: Props) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-xs font-normal normal-case tracking-normal text-dim ${className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}
