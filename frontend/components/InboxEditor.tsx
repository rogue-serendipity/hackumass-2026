import { CaretRightIcon, PencilSimpleIcon, XIcon } from "@phosphor-icons/react";
import { Tag } from "./Tag";
import type { Email } from "@/lib/types";

interface Props {
  emails: Email[];
  original: Email[];
  onChange: (emails: Email[]) => void;
  open: boolean;
  onToggle: () => void;
  disabled: boolean;
  userEmail: string;
}

const field =
  "w-full rounded-xs border border-transparent bg-transparent px-2 py-1 outline-none hover:border-line focus:border-worker focus:bg-ink disabled:opacity-60";

function isEdited(email: Email, original: Email[]) {
  const before = original.find((o) => o.id === email.id);
  return (
    !before ||
    before.from !== email.from ||
    before.subject !== email.subject ||
    before.body !== email.body
  );
}

/** Now, in the contract's format: local ISO 8601 with no timezone. */
function localTimestamp() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 19);
}

function nextId(emails: Email[]) {
  const taken = new Set(emails.map((e) => e.id));
  let n = emails.length + 1;
  while (taken.has(`e${n}`)) n++;
  return `e${n}`;
}

export function InboxEditor({
  emails,
  original,
  onChange,
  open,
  onToggle,
  disabled,
  userEmail,
}: Props) {
  const editedCount = emails.filter((e) => isEdited(e, original)).length;
  const dirty = editedCount > 0 || emails.length !== original.length;

  const patch = (id: string, change: Partial<Email>) =>
    onChange(emails.map((e) => (e.id === id ? { ...e, ...change } : e)));

  const add = () =>
    onChange([
      ...emails,
      {
        id: nextId(emails),
        from: "someone@outside.example",
        to: userEmail,
        subject: "Write your own attack",
        timestamp: localTimestamp(),
        body: "",
        trusted: false,
      },
    ]);

  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="inbox-body"
          className="flex items-center gap-2 text-xs font-semibold font-mono uppercase tracking-wider text-dim hover:text-text"
        >
          <CaretRightIcon
            weight="bold"
            aria-hidden
            className={`transition-transform ${open ? "rotate-90" : ""}`}
          />
          Inbox · {emails.length} {emails.length === 1 ? "email" : "emails"}
        </button>
        {dirty && (
          <Tag tone="accent">edited</Tag>
        )}
        <p className="mr-auto flex items-center gap-1.5 text-sm text-worker">
          <PencilSimpleIcon aria-hidden className="shrink-0" />
          Every email is editable. Write your own attack, then hit Run.
        </p>
        {open && (
          <div className="flex gap-2 text-sm">
            {dirty && (
              <button
                type="button"
                onClick={() => onChange(original)}
                disabled={disabled}
                className="rounded-xs border border-line px-3 py-1.5 text-dim hover:text-text disabled:opacity-50"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={add}
              disabled={disabled}
              className="rounded-xs border border-worker/50 px-3 py-1.5 font-medium text-worker hover:bg-worker/10 disabled:opacity-50"
            >
              + Add email
            </button>
          </div>
        )}
      </div>

      {open && (
        <div
          id="inbox-body"
          className="divide-y divide-line border-t border-line px-4"
        >
          {emails.length === 0 && (
            <p className="py-4 text-sm text-dim">The inbox is empty. Add an email.</p>
          )}
          {emails.map((email) => (
            <article
              key={email.id}
              className="grid gap-x-4 gap-y-1 py-3 text-sm md:grid-cols-[16rem_minmax(0,1fr)_auto]"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3 px-2">
                  <span className="font-mono text-xs text-dim">
                    {email.id}
                    {isEdited(email, original) && (
                      <span className="text-worker" title="Edited">
                        *<span className="sr-only"> edited</span>
                      </span>
                    )}
                  </span>
                  <Tag
                    tone={email.trusted ? "solid" : "hollow"}
                    title={
                      email.trusted
                        ? "The Shadow can read this email's body"
                        : "Untrusted: the Shadow never sees this email's body"
                    }
                  >
                    {email.trusted ? "trusted" : "external"}
                  </Tag>
                </div>
                <input
                  aria-label={`From (${email.id})`}
                  value={email.from}
                  onChange={(e) => patch(email.id, { from: e.target.value })}
                  disabled={disabled}
                  className={`${field} font-mono text-xs text-dim`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <input
                  aria-label={`Subject (${email.id})`}
                  value={email.subject}
                  onChange={(e) => patch(email.id, { subject: e.target.value })}
                  disabled={disabled}
                  className={`${field} font-semibold`}
                />
                <textarea
                  aria-label={`Body (${email.id})`}
                  value={email.body}
                  onChange={(e) => patch(email.id, { body: e.target.value })}
                  disabled={disabled}
                  rows={3}
                  placeholder="Type the email body…"
                  className={`${field} resize-y leading-relaxed`}
                />
              </div>
              <button
                type="button"
                onClick={() => onChange(emails.filter((e) => e.id !== email.id))}
                disabled={disabled}
                aria-label={`Remove email ${email.id}`}
                className="self-start rounded-xs px-1.5 py-1 text-dim hover:text-text disabled:opacity-50"
              >
                <XIcon aria-hidden />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
