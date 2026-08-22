# P1280-R0 — Tokfai Upstream Tool Call Compatibility Probe

```text
PROBE_ONLY=YES
CODE_CHANGED=NO
GOAL=Locate why Codex CLI does not execute real local tools via Tokfai
NOT=Make the model write files in prose
```

## Verdict (one line)

Codex CLI only runs local tools when Tokfai returns Responses **`function_call`** items (from upstream Chat Completions **`tool_calls`**). If logs show `toolsCount>0` but `toolCallCount=0` / `finishReason=stop`, the model answered with **`output_text`** (“我在写入文件…”) — that is **not** tool execution.

---

## 1. DeepSeek native Chat Completions `tool_calls`

DeepSeek (and OpenAI-compatible Chat Completions) use this wire:

**Request**

```json
{
  "model": "deepseek-chat",
  "messages": [...],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "shell",
        "description": "...",
        "parameters": { "type": "object", "properties": { ... } }
      }
    }
  ],
  "tool_choice": "auto"
}
```

**Successful tool-intent response**

```json
{
  "choices": [{
    "finish_reason": "tool_calls",
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [{
        "id": "call_xxx",
        "type": "function",
        "function": {
          "name": "shell",
          "arguments": "{\"command\":\"echo hi\"}"
        }
      }]
    }
  }]
}
```

**Client loop (not Tokfai):**

1. Receive `tool_calls`
2. Execute the named tool locally
3. Append `role=tool` / `tool_call_id` message
4. Call Chat Completions again

**Key facts**

| Fact | Meaning |
|------|---------|
| `finish_reason=tool_calls` | Model requested a tool; client must execute |
| `finish_reason=stop` + text | Model chose prose; **no** tool run |
| `tool_choice=auto` | Model may refuse tools even when `tools[]` is present |
| Gateway does not run tools | Tokfai relays; DeepSeek/provider returns schema only |

Tokfai catalog note: client id `deepseek-chat` is often an **alias** to another upstream SKU — probe logs by **resolved** model, not display name alone.

---

## 2. Codex CLI Responses API tool event mechanism

Codex CLI (`wire_api = responses`) does **not** consume Chat Completions `delta.tool_calls`. It expects Responses shapes:

**Inbound tools (Codex → Tokfai `/v1/responses`)**

- Flat / Responses-style `tools` (often `type: "function"` + top-level `name` / `parameters`)
- Optional `tool_choice` (`auto` | `required` | named)
- Multi-turn: `previous_response_id` + `input` items of type `function_call_output`

**Outbound tool events Codex executes on**

| Event / item | Role |
|--------------|------|
| `response.output_item.added` with `type=function_call` | Start of a call |
| `response.function_call_arguments.delta` (if streamed) | Args stream |
| `response.output_item.done` / completed `function_call` | Args ready |
| Final `response.output[]` includes `{ type: "function_call", call_id, name, arguments }` | Source of truth for execution |

**What Codex does *not* treat as tool execution**

- `output[].type = "message"` with `content[].type = "output_text"`
- Top-level `output_text` string
- Prose like “正在写入 `foo.md`…”

Only after a real `function_call` item does Codex run shell/apply_patch/etc. under `--sandbox`, then POST resume with `function_call_output`.

Tokfai already has pieces of this bridge (`responsesToolsToChatTools`, chat `tool_calls` → Responses `function_call`, `responsesToolStateStore` for resume). Probe focus: **when upstream returns no `tool_calls`, the bridge has nothing to translate**, so Codex never executes.

---

## 3. Log field meanings: `toolsCount`, `toolChoice`, `toolCallCount`, `finishReason`

| Field | Meaning | Common misread |
|-------|---------|----------------|
| **`toolsCount`** | Number of tools on the **inbound** (or restored) request after Responses→Chat normalize | “tools arrived” ≠ “model will call them” |
| **`toolChoice`** | Often **client-side** kind (`auto` / `required` / named / missing) logged on success paths | **≠** proof of outbound provider JSON; use `upstream_tool_choice_wire` for wire fingerprint |
| **`toolCallCount`** | Count of **upstream-returned** (or state-bridged) tool calls after parse | `0` with `toolsCount>0` = tools present, **no** call generated |
| **`finishReason`** | Normalized completion reason (`stop`, `tool_calls`, `length`, …) | On Responses wire, Hermes may still read `function_call` from `output` even if finish is sanitized toward `stop` for text clients — but if **`toolCallCount=0`**, there is nothing to execute |

**Diagnostic patterns**

```text
toolsCount>0 + toolChoice=auto + toolCallCount=0 + finishReason=stop
  → CLASS: model/text path (or policy preserve_auto). Codex will not run tools.

toolsCount>0 + toolCallCount≥1 + finishReason=tool_calls (or function_call items)
  → CLASS: protocol OK. If local file still missing → sandbox / cwd / CLI, not gateway inventing calls.

toolsCount=0
  → Codex did not send tools (config / model / turn). Not a translation bug.
```

Default env policy historically: `TOKFAI_CODEX_TOOL_CHOICE_POLICY=preserve_auto` — Tokfai must **not** invent tools when upstream stops with text.

---

## 4. Why “我在写入文件” is only `output_text`, not tool execution

```text
User: 请写入 docs/aviation/demo/foo.md
        │
        ▼
Codex → POST /v1/responses  (toolsCount>0, tool_choice=auto)
        │
        ▼
Tokfai → Chat Completions upstream (tools forwarded)
        │
        ▼
Upstream: finish_reason=stop, message.content="好的，我正在写入文件…"
        │
        ▼
Tokfai Responses adapter: output = [{ type: message, content: [{ type: output_text, text: "…" }] }]
        │
        ▼
Codex UI shows assistant text  ≠  apply_patch / shell ran
```

| Layer | What happened |
|-------|----------------|
| Model | Chose natural language instead of `tool_calls` |
| Tokfai | Faithfully mapped text → `output_text` |
| Codex | No `function_call` item → **skips** local tool runtime |
| Disk | Unchanged |

Saying “我在写入” is **roleplay**. Real write requires a structured call Codex understands (e.g. shell / apply_patch / write tool name from its schema).

---

## 5. Responses ↔ Chat tool-call translation layer Tokfai still needs to harden

Existing direction (already in tree conceptually):

```text
Responses tools / tool_choice  →  Chat tools / tool_choice
Chat assistant.tool_calls      →  Responses output function_call (+ SSE frames)
function_call_output + previous_response_id  →  Chat role=tool messages
```

**Gaps / hardening targets (probe checklist, no code in P1280)**

1. **Bidirectional fidelity** — Every Chat `tool_calls[i].id/name/arguments` must become Responses `function_call` with stable `call_id` Codex can resume; reverse path must rebuild Chat history without dropping `role=tool`.
2. **Streaming parity** — Codex expects `response.output_item.*` / args deltas; text-only SSE that never emits `function_call` items will never trigger tools even if non-stream path works.
3. **Empty-call guard** — Never synthesize fake `function_call` from prose; never claim file write from `output_text`.
4. **Wire observability** — Log inbound `toolsCount`/`toolChoice` **and** outbound wire fingerprint **and** `toolCallCount` on the same requestId so “tools arrived but no call” is one-line classifiable.
5. **Resume bridge durability** — Round1 `function_call` metadata must survive for round2 `function_call_output` (memory + optional durable store); missing bridge looks like “tools worked once then stalled”.
6. **Provider adapter quirks** — DeepSeek/Gemini/GPT differences in parallel tools, empty `content`, arguments string vs object — normalize **before** Responses emit.
7. **Policy separation** — `preserve_auto` vs opt-in `required_when_tools_present` must remain explicit; translation layer ≠ force-tool heuristic.

---

## 6. Next code change list (do **not** implement in P1280)

| Priority | Item | Intent |
|----------|------|--------|
| P0 | End-to-end canary: Codex `wire_api=responses` + tools → assert `toolCallCount≥1` + local file token | Separate model refusal from gateway bug |
| P0 | Single requestId log bundle: `toolsCount`, inbound/outbound `toolChoice`, `toolCallCount`, `finishReason`, `upstreamReturnedToolCalls` | Stop misreading client `toolChoice` alone |
| P1 | Audit Chat→Responses SSE: every upstream `tool_calls` chunk emits Codex-visible `function_call` frames | Fix “non-stream OK / stream silent” |
| P1 | Audit Responses→Chat tool schema normalize for DeepSeek-shaped providers | Empty parameters / nested `function` wrappers |
| P1 | Resume: `previous_response_id` + `function_call_output` rebuild fidelity test | Multi-turn tool loop |
| P2 | Document model matrix for **true** tool_calls under full Codex schema (prefer proven Gemini routes; DeepSeek alias may not be tool-capable upstream) | Ops: swap model before rewriting gateway |
| P2 | Optional opt-in policy path only behind env; default stay transparent | Compatibility Prime Directive |
| ❌ | Invent `function_call` from Chinese/English “writing file” text | Forbidden — fake tool execution |
| ❌ | Run shell/write inside `apps/dmit-api` | Tokfai is not the Agent runtime |

---

## 7. Probe conclusion

| Question | Answer |
|----------|--------|
| Did tools reach Tokfai? | Check `toolsCount` |
| Did upstream request a tool? | Check `toolCallCount` / `upstreamReturnedToolCalls` |
| Why no local write? | Usually `toolCallCount=0` → only `output_text` |
| Fix location | Model selection / tool_choice policy / translation fidelity — **not** “teach model to say it wrote” |
| P1280 scope | Docs probe only |

```text
TOKFAI_P1280_TOOL_CALL_COMPAT_PROBE_DONE
```
