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
