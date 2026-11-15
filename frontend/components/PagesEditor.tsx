import { CaretRightIcon, GlobeIcon } from "@phosphor-icons/react";
import type { Page } from "@/lib/types";
import { Tag } from "./Tag";

interface Props {
  pages: Page[];
  original: Page[];
  onChange: (pages: Page[]) => void;
  open: boolean;
  onToggle: () => void;
  disabled: boolean;
}

const field =
  "w-full rounded-xs border border-transparent bg-transparent px-2 py-1 outline-none hover:border-line focus:border-worker focus:bg-ink disabled:opacity-60";

function isEdited(page: Page, original: Page[]) {
  const before = original.find((o) => o.id === page.id);
  return !before || before.url !== page.url || before.title !== page.title || before.body !== page.body;
}

/** The scenario's mock web: editable like the inbox, so a judge can plant an attack in a page. */
export function PagesEditor({ pages, original, onChange, open, onToggle, disabled }: Props) {
  const dirty = pages.some((p) => isEdited(p, original)) || pages.length !== original.length;
  const patch = (id: string, change: Partial<Page>) =>
    onChange(pages.map((p) => (p.id === id ? { ...p, ...change } : p)));

  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="pages-body"
          className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-dim hover:text-text"
        >
          <CaretRightIcon weight="bold" aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`} />
          Web · {pages.length} {pages.length === 1 ? "page" : "pages"}
        </button>
        {dirty && <Tag tone="accent">edited</Tag>}
        <p className="mr-auto flex items-center gap-1.5 text-sm text-dim">
          <GlobeIcon aria-hidden className="shrink-0" />
          The assistant can search and open these. The Shadow sees only each page&apos;s address and title.
        </p>
        {open && dirty && (
          <button
            type="button"
            onClick={() => onChange(original)}
            disabled={disabled}
            className="rounded-xs border border-line px-3 py-1.5 text-sm text-dim hover:text-text disabled:opacity-50"
          >
            Reset pages
          </button>
        )}
      </div>

      {open && (
        <div id="pages-body" className="divide-y divide-line border-t border-line px-4">
          {pages.map((page) => (
            <article key={page.id} className="grid gap-x-4 gap-y-1 py-3 text-sm md:grid-cols-[16rem_minmax(0,1fr)]">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3 px-2">
                  <span className="font-mono text-xs text-dim">
                    {page.id}
                    {isEdited(page, original) && (
                      <span className="text-worker" title="Edited">
                        *<span className="sr-only"> edited</span>
                      </span>
                    )}
                  </span>
                  <Tag
                    tone={page.trusted ? "solid" : "hollow"}
                    title={page.trusted ? "The Shadow can read this page" : "Untrusted: the Shadow never sees this page's content"}
                  >
                    {page.trusted ? "trusted" : "external site"}
                  </Tag>
                </div>
                <input
                  aria-label={`Address (${page.id})`}
                  value={page.url}
                  onChange={(e) => patch(page.id, { url: e.target.value })}
                  disabled={disabled}
                  className={`${field} font-mono text-xs text-dim`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <input
                  aria-label={`Title (${page.id})`}
                  value={page.title}
                  onChange={(e) => patch(page.id, { title: e.target.value })}
                  disabled={disabled}
                  className={`${field} font-semibold`}
                />
                <textarea
                  aria-label={`Content (${page.id})`}
                  value={page.body}
                  onChange={(e) => patch(page.id, { body: e.target.value })}
                  disabled={disabled}
                  rows={3}
                  placeholder="Type the page's content…"
                  className={`${field} resize-y leading-relaxed`}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
