interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  userName?: string;
}

export function RequestBox({ value, onChange, disabled, userName }: Props) {
  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <label
        htmlFor="request"
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-dim"
      >
        {userName ? `${userName} asks the assistant` : "User request"}
        <span className="rounded bg-ok/15 px-1.5 py-0.5 text-[11px] text-ok">
          trusted
        </span>
      </label>
      <textarea
        id="request"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={2}
        className="mt-2 w-full resize-none rounded-lg border border-line bg-ink px-3 py-2 text-lg outline-none focus:border-worker disabled:opacity-60"
      />
    </section>
  );
}
