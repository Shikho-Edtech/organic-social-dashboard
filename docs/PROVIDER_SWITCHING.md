# PROVIDER_SWITCHING

How per-stage AI provider + model selection works after step 2 of the
[ROADMAP](ROADMAP.md). One contract, one seam, one env-var convention.

## The principle

Each AI-using stage reads its own provider/model/key from env vars.
No global "AI provider" setting. The three AI call sites (classification
v2, weekly diagnosis, content calendar) are independent consumers.

This means you can run:

- **Classification** on a cheap model (Haiku / GPT-4o-mini) — it's the
  highest-volume call (batches of 15 posts, dozens per week)
- **Diagnosis** on a reasoning model (Sonnet / GPT-4o) — low volume,
  high cognitive load, worth paying for
- **Calendar** on whichever model produces the most useful output that
  week

Or turn them all off by unsetting the keys.

## Env var contract

Per stage:

| Stage | Env var prefix |
|---|---|
| Classification (v2 augmentation) | `CLASSIFY_` |
| Weekly diagnosis | `DIAGNOSIS_` |
| Content calendar | `CALENDAR_` |

For each prefix, three variables:

```bash
<PREFIX>PROVIDER   # "anthropic" | "gemini" | "none"
<PREFIX>MODEL      # provider-specific model id
<PREFIX>API_KEY    # provider-specific key
```

So a full config with Anthropic everywhere:

```bash
CLASSIFY_PROVIDER=anthropic
CLASSIFY_MODEL=claude-haiku-4-6
CLASSIFY_API_KEY=sk-ant-...

DIAGNOSIS_PROVIDER=anthropic
DIAGNOSIS_MODEL=claude-sonnet-4-6
DIAGNOSIS_API_KEY=sk-ant-...

CALENDAR_PROVIDER=anthropic
CALENDAR_MODEL=claude-sonnet-4-6
CALENDAR_API_KEY=sk-ant-...
```

All-Gemini config (Shikho Tier 3 credits, current default):

```bash
DEFAULT_LLM_PROVIDER=gemini
GEMINI_API_KEY=AIza...
# Per-stage triples auto-backfilled from defaults in config.py:
#   CLASSIFY_MODEL  = gemini-2.5-flash
#   DIAGNOSIS_MODEL = gemini-2.5-pro
#   CALENDAR_MODEL  = gemini-2.5-pro
```

Mixed config (per-stage override wins over DEFAULT_LLM_PROVIDER):

```bash
CLASSIFY_PROVIDER=gemini
CLASSIFY_MODEL=gemini-2.5-flash
CLASSIFY_API_KEY=AIza...

DIAGNOSIS_PROVIDER=anthropic
DIAGNOSIS_MODEL=claude-sonnet-4-6
DIAGNOSIS_API_KEY=sk-ant-...

CALENDAR_PROVIDER=none   # skip calendar entirely this run
```

## Gemini-specific notes

- **SDK:** `google-genai` (the unified Gen AI SDK, not the older
  `google-generativeai`). Instantiates per-adapter, so each stage can
  carry its own key if ever needed.
- **Model defaults** (in `facebook-pipeline/src/config.py`):
  Classify on `gemini-2.5-flash`, Diagnosis and Calendar on
  `gemini-2.5-pro`. Override per stage via `<STAGE>_MODEL`.
- **Salvage parser caveat:** `classify.py::_salvage_truncated_calendar`
  reads Anthropic fields (`raw.content`, `raw.stop_reason`). When
  `CALENDAR_PROVIDER=gemini`, salvage is a no-op. Gemini truncation
  surfaces as `response.candidates[0].finish_reason == "MAX_TOKENS"`.
  Bump `CALENDAR` max_tokens in config if calendar output truncates,
  or extend salvage to read Gemini fields.
- **Rate limits:** Gemini API has per-minute limits that differ from
  Anthropic's. Tier 3 is generous, but classification's batched calls
  may need brief sleeps between batches if you see 429s. `_call_with_retry`
  handles this transparently today.

**`PROVIDER=none`** (or any key unset) → the stage logs "skipped: no
provider configured" and returns empty. The pipeline continues. The
dashboard's AI-disabled empty state kicks in for that artifact.

## How the client reads it

```python
# facebook-pipeline/src/llm/client.py
class LLMClient:
    @classmethod
    def from_env(cls, stage_prefix: str) -> "LLMClient | None":
        provider = os.environ.get(f"{stage_prefix}_PROVIDER", "").lower()
        if not provider or provider == "none":
            return None
        model = os.environ[f"{stage_prefix}_MODEL"]
        api_key = os.environ[f"{stage_prefix}_API_KEY"]
        adapter = _ADAPTERS[provider](model=model, api_key=api_key)
        return cls(adapter=adapter, stage=stage_prefix.rstrip("_").lower())
```

Each stage instantiates its own client:

```python
# classify.py
classify_client = LLMClient.from_env("CLASSIFY")
if classify_client is None:
    logger.info("classify: no AI provider configured, skipping v2 augmentation")
    return classifications_v1  # native output only
```

## Storage

- **Local dev:** `.env.local` (gitignored)
- **CI (GitHub Actions):** repo secrets named with the same keys.
  `weekly.yml` exports them to the step env. `weekly-no-ai.yml`
  deliberately does not export `DIAGNOSIS_*` or `CALENDAR_*`.

## What swapping providers actually means

There's a gap between *provider flexibility* (the env contract above)
and *provider interchangeability* (byte-identical output across
providers). The lean roadmap delivers the former only.

| Concern | Step 2 delivers | Full plan would add |
|---|---|---|
| Swap model within Anthropic | yes, config only | same |
| Swap to OpenAI for diagnosis | yes, config only after OpenAI adapter lands | same |
| Prompt just works on the new provider | probably, for classification + diagnosis | guaranteed via per-provider templates |
| Salvage function handles truncation the same way | **no** — salvage is tuned to Sonnet's truncation pattern | yes, per-provider salvage |
| Cost / token accounting consistent | yes (stage-level) | same |

Translation: when you swap provider on the calendar stage, expect a
~2 hour tuning pass on the salvage parser. For classification and
diagnosis, expect it to just work.

## Rotation

Rotate keys by updating the env var. No code change, no sheet change.
The pipeline reads fresh env on every run.

If you want to track rotations, add a one-line entry to
[DECISIONS.md](../DECISIONS.md) ("rotated DIAGNOSIS_API_KEY because of
X"). Don't build a key-rotation sheet tab — that's deferred per
[ROADMAP.md](ROADMAP.md).

## Related

- Full abstraction spec: [ARCHITECTURE.md](ARCHITECTURE.md) §5
- When multi-provider adapters land: [ROADMAP.md](ROADMAP.md) step 2
  extension (not scheduled)
