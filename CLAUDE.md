# Task: M3.4 — AI Lore Seed Generation

## What to Build

When a stamp is placed on the map, automatically generate seed lore using Claude claude-haiku-4-5 (via Anthropic API / Req HTTP). The lore appears in the lore panel and fills in as it streams (non-blocking).

## Context

- Elixir/Phoenix + CanvasKit WASM + TypeScript project
- Repo: `/root/projects/parchment_studios/`
- Oban is already set up with a `:ai` queue (concurrency 2)
- `LoreEntry` schema exists: id, project_id, title, type, content, map_pins
- `ParchmentStudios.Lore` context: create_lore_entry/1, update_lore_entry/2
- LiveView: `MapEditorLive` — handles `place_stamp` event, creates LoreEntry
- `req` is in deps already
- Anthropic API key is in env: `System.get_env("ANTHROPIC_API_KEY")` — check if set, fall back gracefully

## Architecture

### Worker: `ParchmentStudios.Workers.GenerateLore`

Oban worker in `:ai` queue.

Args: `%{"lore_entry_id" => id, "stamp_name" => name, "stamp_type" => type}`

Logic:
1. Get LoreEntry from DB
2. Call Anthropic Messages API (claude-haiku-4-5, non-streaming for simplicity)
3. Prompt generates: a fantasy name, 2-sentence backstory, 2 story hooks
4. Update LoreEntry with generated content
5. Broadcast via `PubSub` so LiveView can push to client in real time

### Prompt Template

```
You are a fantasy worldbuilding assistant. Generate seed lore for a {type} called "{name}" in a classic fantasy world.

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "name": "evocative fantasy name",
  "backstory": "2-sentence rich history",
  "hooks": ["story hook 1", "story hook 2"]
}
```

Format the content for the LoreEntry as:
```
# {name}

{backstory}

## Story Hooks
- {hook1}
- {hook2}
```

### LiveView Integration

In `MapEditorLive`:
- After creating LoreEntry + enqueuing Oban job, set `lore_generating: true` in assigns
- Subscribe to `"lore:#{lore_entry_id}"` PubSub topic
- Handle `PubSub` message `{:lore_generated, entry}` → update socket, push to client
- Lore panel shows "✨ Generating lore..." spinner when `lore_generating: true`

### Fallback

If `ANTHROPIC_API_KEY` is not set or API fails:
- Log warning
- Leave content as empty string (user can write their own)
- Worker returns `{:ok, :skipped}` — no Oban retry for missing key

## Files to Create/Modify

1. **`lib/parchment_studios/workers/generate_lore.ex`** — new Oban worker
2. **`lib/parchment_studios_web/live/map_editor_live.ex`** — enqueue job after stamp placement, handle PubSub
3. **`test/parchment_studios/workers/generate_lore_test.exs`** — test with Oban.Testing + mock API response
4. **`test/parchment_studios_web/live/map_editor_live_test.exs`** — test lore_generating state

## Done When

- [ ] `mix test` passes (all existing + new tests)
- [ ] Place a stamp → lore panel shows "✨ Generating lore..." 
- [ ] Worker runs via Oban and updates LoreEntry with AI content
- [ ] PubSub broadcasts to LiveView → panel fills in with generated lore
- [ ] If API key missing → graceful no-op, no crash
- [ ] `mix precommit` passes (format + credo + test)

## Commit

```
feat(M3.4): AI lore seed generation via Oban + Anthropic API
```

## Important

- Do NOT use `Task.async` — everything goes through Oban (project rule)
- Keep the Anthropic call simple: Req.post with Messages API, parse JSON response
- No streaming for now — complete response then update DB + broadcast
- Run `MIX_ENV=test mix test` to verify all tests pass before committing
- CLAUDE_CODE_ALLOW_ROOT=1 is already set
