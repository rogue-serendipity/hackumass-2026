export interface QuoteSplit {
  before: string;
  match: string;
  after: string;
}

/** Split `body` around the first occurrence of `quote`; null if it isn't there. */
export function splitAroundQuote(
  body: string,
  quote: string | null | undefined,
): QuoteSplit | null {
  if (!quote) return null;
  const at = body.indexOf(quote);
  if (at === -1) return null;
  return {
    before: body.slice(0, at),
    match: quote,
    after: body.slice(at + quote.length),
  };
}

export interface Segment {
  text: string;
  match: boolean;
}

/**
 * Split `body` into plain and matching segments for every occurrence of any of
 * `terms`, case-insensitively. Longer terms win where two overlap.
 */
export function splitByTerms(body: string, terms: string[]): Segment[] {
  const wanted = [...new Set(terms.map((t) => t.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (wanted.length === 0 || !body) return [{ text: body, match: false }];
  const escaped = wanted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const out: Segment[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: body.slice(last, at), match: false });
    out.push({ text: m[0], match: true });
    last = at + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), match: false });
  return out.length ? out : [{ text: body, match: false }];
}
