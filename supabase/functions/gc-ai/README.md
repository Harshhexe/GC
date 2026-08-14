# gc-ai — the GC AI foundation

One edge function behind every AI feature. The client can name a group and an
operation; everything else — prompts, model, message selection, spend — is
decided here.

## Why it's shaped this way

- **The API key never leaves the server.** `GEMINI_API_KEY` is a Supabase
  function secret. There is no client code path that can read it, because
  there is no client code that talks to a provider.
- **Membership is proven before anything is spent.** `auth.ts` builds two
  clients: one carrying the caller's JWT (so RLS applies to every message that
  reaches a prompt) and one service-role client used only after membership is
  confirmed, and only for the AI bookkeeping tables.
- **The client can't ask for another group's history.** The request body is
  `{ groupId, operation, params? }` — no message ids, no filters that could be
  pointed elsewhere. `assertGroupMembership` returns the same `not_a_member`
  error whether the group is missing or the caller simply isn't in it.
- **Deleted and hidden messages don't reach the model.** `normalize.ts` drops
  `is_deleted` rows and anything the caller has hidden, and media becomes a
  label (`[photo]`) — never bytes.
- **The ledger is the rate limiter.** `ai_usage` is written for successes,
  cache hits and failures alike, and the hourly limits are counted from it.
  One table, one truth, and a client can't delete its way out (service-role
  only, no `authenticated` policies).
- **Neither AI table stores message content.** `ai_cache` holds results and a
  SHA-256 of `id:timestamp` pairs; `ai_usage` holds counts and timings.

## Request order

`auth → membership → rate limit → context → cache → provider → cache write`

Deliberately cheapest-first: the request that costs money only runs after
every free reason to reject it has been checked.

## Adding a feature

Add an operation under `operations/`, register it in `operations/registry.ts`,
and add its name to `AIOperationName` in `src/lib/ai.ts`. Nothing else in the
client changes — that's the point of the seam.

Swapping providers means one new file under `provider/` implementing
`AIProvider` plus a case in `provider/index.ts`. No operation code changes.

## Providers

Gemini by default (`GC_AI_PROVIDER=gemini`, `gemini-3.6-flash`), chosen because
its free tier covers GC's usage and the operations here are summarisation.
Anthropic is still implemented in `provider/anthropic.ts` — switching is two
secrets, no code change:

```bash
npx supabase secrets set GC_AI_PROVIDER=anthropic GC_AI_MODEL=claude-opus-5
```

Provider and model move together: a Gemini model ID with the Anthropic provider
(or the reverse) is a 400 from the vendor, not a config error we can catch.

## Deploy

```bash
npx supabase secrets set GEMINI_API_KEY=AIza...
npx supabase functions deploy gc-ai
```

The `ai_foundation` migration (`supabase/ai_foundation.sql`) must be applied
first — it creates `ai_cache` and `ai_usage`.

## Smoke test

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/gc-ai" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"groupId":"<a group you are in>","operation":"test_summary"}'
```

Expect `{ ok: true, cached: false, result: { summary, highlights } }`, and a
second identical call within the TTL to return `cached: true`.
