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
  "w-full rounded-md border border-transparent bg-ink px-2 py-1 outline-none hover:border-line focus:border-worker disabled:opacity-60";

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
    <section className="rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="inbox-body"
          className="flex items-center gap-2 text-xs font-semibold font-mono uppercase tracking-wider text-dim hover:text-text"
        >
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>
            ▸
          </span>
          Inbox · {emails.length} {emails.length === 1 ? "email" : "emails"}
        </button>
        {dirty && (
          <span className="rounded bg-warn/15 px-1.5 py-0.5 font-mono text-xs font-medium text-warn">
            edited
          </span>
        )}
        <p className="mr-auto text-sm text-worker">
          ✎ Every email is editable. Write your own attack, then hit Run.
        </p>
        {open && (
          <div className="flex gap-2 text-sm">
            {dirty && (
              <button
                type="button"
                onClick={() => onChange(original)}
                disabled={disabled}
                className="rounded-md border border-line px-3 py-1.5 text-dim hover:text-text disabled:opacity-50"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={add}
              disabled={disabled}
              className="rounded-md border border-worker/50 px-3 py-1.5 font-medium text-worker hover:bg-worker/10 disabled:opacity-50"
            >
              + Add email
            </button>
          </div>
        )}
      </div>

      {open && (
        <div
          id="inbox-body"
          className="grid gap-3 border-t border-line p-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {emails.length === 0 && (
            <p className="text-sm text-dim">The inbox is empty. Add an email.</p>
          )}
          {emails.map((email) => (
            <article
              key={email.id}
              className="flex flex-col gap-1.5 rounded-lg border border-line bg-raised p-3 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-dim">{email.id}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-semibold font-mono uppercase tracking-wide ${
                    email.trusted
                      ? "bg-ok/15 text-ok"
                      : "bg-shadow/15 text-shadow"
                  }`}
                  title={
                    email.trusted
                      ? "The Shadow can read this email's body"
                      : "Untrusted: the Shadow never sees this email's body"
                  }
                >
                  {email.trusted ? "trusted" : "external"}
                </span>
                {isEdited(email, original) && (
                  <span className="font-mono text-[11px] font-medium text-warn">edited</span>
                )}
                <button
                  type="button"
                  onClick={() => onChange(emails.filter((e) => e.id !== email.id))}
                  disabled={disabled}
                  aria-label={`Remove email ${email.id}`}
                  className="ml-auto rounded px-1.5 text-dim hover:text-danger disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
              <input
                aria-label={`From (${email.id})`}
                value={email.from}
                onChange={(e) => patch(email.id, { from: e.target.value })}
                disabled={disabled}
                className={`${field} font-mono text-xs text-dim`}
              />
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
                rows={7}
                placeholder="Type the email body…"
                className={`${field} resize-y leading-relaxed`}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
