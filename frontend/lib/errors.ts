/**
 * Turn a raw run error (often "ExceptionType: provider message") into a
 * headline a room can read, plus the raw text as detail for whoever debugs it.
 */
export function describeError(raw: string): { title: string; hint: string } {
  const m = raw.toLowerCase();
  if (m.includes("can't reach the backend") || m.includes("failed to fetch"))
    return { title: "Can't reach the backend", hint: "Start the backend server, then run again." };
  if (m.includes("lost the connection"))
    return { title: "Lost the connection mid-run", hint: "The backend stopped streaming. Run again." };
  if (m.includes("401") || m.includes("invalid api key") || m.includes("unauthorized"))
    return { title: "The model provider rejected the API key", hint: "Check the key in backend/.env." };
  if (m.includes("429") || m.includes("rate limit") || m.includes("ratelimit") || m.includes("too many requests"))
    return { title: "The model provider is rate-limiting us", hint: "Wait a few seconds and run again." };
  if (m.includes("timeout") || m.includes("timed out"))
    return { title: "The model took too long to answer", hint: "Run again; the provider may be busy." };
  if (/\b5\d\d\b/.test(m) || m.includes("service unavailable") || m.includes("bad gateway"))
    return { title: "The model provider had an error", hint: "Run again in a moment." };
  if (m.includes("runtimeerror: missing ") || m.includes("keyerror") || m.includes("environment variable") || m.includes("env var") || m.includes("not set"))
    return { title: "The backend is missing configuration", hint: "Check backend/.env against .env.example." };
  if (m.startsWith("invalid overrides"))
    return { title: "The edited inbox isn't valid", hint: "Check the emails you changed, or reset the demo." };
  return { title: "The run didn't finish", hint: "Run again. If it keeps failing, the detail below says why." };
}
