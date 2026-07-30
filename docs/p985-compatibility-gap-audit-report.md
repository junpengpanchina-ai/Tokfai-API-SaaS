# P985 — OpenAI / Cursor Compatibility Gap Audit Report

> Audit only. **Does not claim fully compatible.** Marker means audit completed, not that all gaps are fixed.

## Result: **AUDIT COMPLETE**

Marker: `TOKFAI_P985_COMPATIBILITY_GAP_AUDIT_PASS`

Mode: offline mock
Generated: 2026-07-30T06:15:23.953Z

## Compatibility matrix summary

| Verdict | Meaning | Count |
|---|---|---|
| PASS | 可商用 | 22 |
| WARN | 可用但有边界 | 7 |
| FAIL | 必须修 | 0 |
| BLOCKER | 商业前必须修 | 0 |

## Source notes (static)

- Source: response_format json_schema is accepted client-side but NOT forwarded upstream (only json_object/text).
- Source: OpenAI `n` (multi-choice) is not a first-class schema field; multi-completion not guaranteed.
- Policy: tools only on VERIFIED_TOOLS_CAPABLE_MODEL_IDS whitelist — not all models; do not advertise fully compatible.

## Case results

| case_name | verdict | http | parse | openai shape | cursor likely | billing | credits | request_id | failure reason |
|---|---|---|---|---|---|---|---|---|---|
| `non_stream_chat` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_9ef95b53784093f` | Ordinary chat success path |
| `stream_chat` | PASS | 200 | true | true | true | — | — | `—` | SSE data chunks + [DONE] |
| `tool_calls_non_stream` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_a387805ced576ad` | Requires verified tools whitelist (gpt-5.5 offline) |
| `tool_calls_stream` | PASS | 200 | true | true | true | — | 0 | `—` |  |
| `tool_result_second_turn` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_3a98df45c07acfb` |  |
| `function_role_legacy` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_6ae66af8a3af0b5` | Legacy OpenAI function role / function_call |
| `response_format_json_object` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_5791aba43d546ba` |  |
| `response_format_json_schema` | WARN | 200 | true | true | false | charged | 0.000001 | `req_mock_f9084b2fa94429b` | json_schema likely stripped before upstream — structured guarantee not claimed |
| `content_array_messages` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_09a5cdc6be655e2` |  |
| `roles_system_developer_user_assistant` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_e19327ae5606120` | developer role typically mapped to system |
| `sampling_stop_temperature_top_p_max_tokens` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_38e747588330b79` | max_completion_tokens promoted to max_tokens server-side |
| `n_parameter` | WARN | 200 | true | true | true | charged | 0.000001 | `req_mock_bf03aaa41d160c4` | accepted but choices=1 (OpenAI n=2 not fully honored) |
| `invalid_model` | PASS | 400 | true | true | true | not_billable | 0 | `req_mock_34cf99a26f954ea` |  |
| `missing_model` | WARN | 200 | true | true | true | charged | 0.000001 | `req_mock_2c2533abe8ff0aa` | defaults to server BOT_MODEL (not strict OpenAI required-model) |
| `missing_messages` | WARN | 200 | true | true | true | not_billable | 0 | `req_mock_fbadfc42f39185a` | Cherry-style empty_messages noop 200 not_billable (OpenAI clients may expect 400) |
| `malformed_json` | WARN | 500 | true | true | true | — | 0 | `req_mock_f675687c1c71bf5` | error returned but status=500 (clients often expect 400) |
| `client_abort` | WARN | 200 | true | — | true | — | — | `—` | abort raced; response completed before cancel (environment-dependent) |
| `upstream_timeout` | PASS | 504 | true | true | true | not_billable | 0 | `req_mock_5423ca7effcec1f` | offline mock upstream_timeout |
| `retry_duplicate_idempotency` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_40efe8e59f93b8a` |  |
| `request_id_and_credits_consistency` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_2eb2a41ed0c9009` |  |
| `cursor_readonly_project_dir` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_9c1005293687595` | Chat-only simulation of Cursor instruction; tools not attached |
| `cursor_read_file_explain` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_c24169ccc3abf88` | Chat-only simulation of Cursor instruction; tools not attached |
| `cursor_summarize_git_diff` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_36e46903e85497a` | Chat-only simulation of Cursor instruction; tools not attached |
| `cursor_forbid_modify` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_578034e2af95427` | Chat-only simulation of Cursor instruction; tools not attached |
| `cursor_allow_small_file_edit` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_b8b46c081abbfdf` | Chat-only simulation of Cursor instruction; tools not attached |
| `cursor_forced_tool_call` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_e6f56f3bb1acf19` |  |
| `cursor_tool_result_second_turn` | PASS | 200 | true | true | true | charged | 0.000001 | `req_mock_6fc9788c36e91f8` |  |
| `cursor_stream_tool_call` | PASS | 200 | true | true | true | — | 0 | `—` |  |
| `cursor_tools_on_auto_fast` | WARN | 400 | true | true | false | not_billable | 0 | `req_mock_7c4ef08249614fa` | auto-fast not tools-verified — code=model_not_tool_capable (Cursor agents may need gpt-5.5 / whitelist) |

## Case request bodies (abbreviated)

### non_stream_chat (`PASS`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "P985 non-stream hello"
    }
  ],
  "stream": false,
  "max_tokens": 24
}
```

### stream_chat (`PASS`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "P985 stream hello"
    }
  ],
  "stream": true,
  "max_tokens": 24
}
```

### tool_calls_non_stream (`PASS`)

```json
{
  "model": "gpt-5.5",
  "messages": [
    {
      "role": "user",
      "content": "What is the weather in Shanghai?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get weather",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string"
            }
          },
          "required": [
            "location"
          ]
        }
      }
    }
  ],
  "tool_choice": "required",
  "stream": false
}
```

### tool_calls_stream (`PASS`)

```json
{
  "model": "gpt-5.5",
  "messages": [
    {
      "role": "user",
      "content": "Weather tool stream"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get weather",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string"
            }
          },
          "required": [
            "location"
          ]
        }
      }
    }
  ],
  "tool_choice": "required",
  "stream": true
}
```

### tool_result_second_turn (`PASS`)

```json
{
  "model": "gpt-5.5",
  "messages": [
    {
      "role": "user",
      "content": "Weather in Shanghai?"
    },
    {
      "role": "assistant",
      "content": null,
      "tool_calls": [
        {
          "id": "call_p985_1",
          "type": "function",
          "function": {
            "name": "get_weather",
            "arguments": "{\"location\":\"Shanghai\"}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_p985_1",
      "content": "{\"temp\":22,\"unit\":\"C\"}"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get weather",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string"
            }
          },
          "required": [
            "location"
          ]
        }
      }
    }
  ],
  "stream": false,
  "max_tokens": 64
}
```

### function_role_legacy (`PASS`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "legacy function role"
    },
    {
      "role": "assistant",
      "content": null,
      "function_call": {
        "name": "get_weather",
        "arguments": "{\"location\":\"Paris\"}"
      }
    },
    {
      "role": "function",
      "name": "get_weather",
      "content": "{\"temp\":18}"
    }
  ],
  "stream": false,
  "max_tokens": 32
}
```

### response_format_json_object (`PASS`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "Reply with JSON {\"ok\":true}"
    }
  ],
  "response_format": {
    "type": "json_object"
  },
  "stream": false,
  "max_tokens": 64
}
```

### response_format_json_schema (`WARN`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "Reply structured"
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "answer",
      "schema": {
        "type": "object",
        "properties": {
          "ok": {
            "type": "boolean"
          }
        },
        "required": [
          "ok"
        ]
      }
    }
  },
  "stream": false,
  "max_tokens": 64
}
```

### content_array_messages (`PASS`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "P985 content array: say ok"
        }
      ]
    }
  ],
  "stream": false,
  "max_tokens": 16
}
```

### roles_system_developer_user_assistant (`PASS`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "system",
      "content": "You are concise."
    },
    {
      "role": "developer",
      "content": "Prefer short answers."
    },
    {
      "role": "user",
      "content": "Say ok"
    },
    {
      "role": "assistant",
      "content": "ok"
    },
    {
      "role": "user",
      "content": "Again: ok"
    }
  ],
  "stream": false,
  "max_tokens": 16
}
```

### sampling_stop_temperature_top_p_max_tokens (`PASS`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "params"
    }
  ],
  "stream": false,
  "temperature": 0.2,
  "top_p": 0.9,
  "stop": [
    "\n\n"
  ],
  "max_tokens": 16,
  "max_completion_tokens": 32
}
```

### n_parameter (`WARN`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "n=2"
    }
  ],
  "stream": false,
  "n": 2,
  "max_tokens": 8
}
```

### invalid_model (`PASS`)

```json
{
  "model": "p985-totally-invalid-model",
  "messages": [
    {
      "role": "user",
      "content": "x"
    }
  ],
  "stream": false
}
```

### missing_model (`WARN`)

```json
{
  "messages": [
    {
      "role": "user",
      "content": "missing model"
    }
  ],
  "stream": false,
  "max_tokens": 8
}
```

### missing_messages (`WARN`)

```json
{
  "model": "auto-fast",
  "stream": false
}
```

### malformed_json (`WARN`)

```json
"{not-json"
```

### client_abort (`WARN`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "abort me slowly"
    }
  ],
  "stream": true,
  "max_tokens": 64
}
```

### upstream_timeout (`PASS`)

```json
{
  "model": "__tokfai_mock_upstream_timeout",
  "messages": [
    {
      "role": "user",
      "content": "timeout"
    }
  ],
  "stream": false
}
```

### retry_duplicate_idempotency (`PASS`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "idempotency probe"
    }
  ],
  "stream": false,
  "max_tokens": 8,
  "_idempotency_key": "p985-1785392123944-23983ed9f15f1"
}
```

### request_id_and_credits_consistency (`PASS`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "consistency"
    }
  ],
  "stream": false,
  "max_tokens": 8
}
```

### cursor_readonly_project_dir (`PASS`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "List the project directory. Do not modify any files."
    }
  ],
  "stream": false,
  "max_tokens": 64,
  "temperature": 0
}
```

### cursor_read_file_explain (`PASS`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "Read apps/dmit-api/package.json and explain the scripts briefly. Do not modify files."
    }
  ],
  "stream": false,
  "max_tokens": 64,
  "temperature": 0
}
```

### cursor_summarize_git_diff (`PASS`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "Summarize git diff --stat. Do not modify files."
    }
  ],
  "stream": false,
  "max_tokens": 64,
  "temperature": 0
}
```

### cursor_forbid_modify (`PASS`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "You must NOT edit or write any files. Only answer: OK_NO_EDIT"
    }
  ],
  "stream": false,
  "max_tokens": 64,
  "temperature": 0
}
```

### cursor_allow_small_file_edit (`PASS`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "You may edit a small markdown file if needed. Confirm policy: ALLOW_SMALL_EDIT"
    }
  ],
  "stream": false,
  "max_tokens": 64,
  "temperature": 0
}
```

### cursor_forced_tool_call (`PASS`)

```json
{
  "model": "gpt-5.5",
  "messages": [
    {
      "role": "user",
      "content": "Read package.json using tools. You must call a tool."
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "read_file",
        "description": "Read a project file",
        "parameters": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string"
            }
          },
          "required": [
            "path"
          ]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "run_terminal_cmd",
        "description": "Run a shell command",
        "parameters": {
          "type": "object",
          "properties": {
            "command": {
              "type": "string"
            },
            "explanation": {
              "type": "string"
            }
          },
          "required": [
            "command"
          ]
        }
      }
    }
  ],
  "tool_choice": "required",
  "stream": false
}
```

### cursor_tool_result_second_turn (`PASS`)

```json
{
  "model": "gpt-5.5",
  "messages": [
    {
      "role": "user",
      "content": "Read README.md"
    },
    {
      "role": "assistant",
      "content": null,
      "tool_calls": [
        {
          "id": "call_cursor_1",
          "type": "function",
          "function": {
            "name": "read_file",
            "arguments": "{\"path\":\"README.md\"}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_cursor_1",
      "content": "# Tokfai\nOpenAI-compatible API"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "read_file",
        "description": "Read a project file",
        "parameters": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string"
            }
          },
          "required": [
            "path"
          ]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "run_terminal_cmd",
        "description": "Run a shell command",
        "parameters": {
          "type": "object",
          "properties": {
            "command": {
              "type": "string"
            },
    
```

### cursor_stream_tool_call (`PASS`)

```json
{
  "model": "gpt-5.5",
  "messages": [
    {
      "role": "user",
      "content": "Use a tool in stream mode"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "read_file",
        "description": "Read a project file",
        "parameters": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string"
            }
          },
          "required": [
            "path"
          ]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "run_terminal_cmd",
        "description": "Run a shell command",
        "parameters": {
          "type": "object",
          "properties": {
            "command": {
              "type": "string"
            },
            "explanation": {
              "type": "string"
            }
          },
          "required": [
            "command"
          ]
        }
      }
    }
  ],
  "tool_choice": "required",
  "stream": true
}
```

### cursor_tools_on_auto_fast (`WARN`)

```json
{
  "model": "auto-fast",
  "messages": [
    {
      "role": "user",
      "content": "Call a tool"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "read_file",
        "description": "Read a project file",
        "parameters": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string"
            }
          },
          "required": [
            "path"
          ]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "run_terminal_cmd",
        "description": "Run a shell command",
        "parameters": {
          "type": "object",
          "properties": {
            "command": {
              "type": "string"
            },
            "explanation": {
              "type": "string"
            }
          },
          "required": [
            "command"
          ]
        }
      }
    }
  ],
  "tool_choice": "required",
  "stream": false
}
```

## Gap highlights for product

- **WARN** `response_format_json_schema`: json_schema likely stripped before upstream — structured guarantee not claimed
- **WARN** `n_parameter`: accepted but choices=1 (OpenAI n=2 not fully honored)
- **WARN** `missing_model`: defaults to server BOT_MODEL (not strict OpenAI required-model)
- **WARN** `missing_messages`: Cherry-style empty_messages noop 200 not_billable (OpenAI clients may expect 400)
- **WARN** `malformed_json`: error returned but status=500 (clients often expect 400)
- **WARN** `client_abort`: abort raced; response completed before cancel (environment-dependent)
- **WARN** `cursor_tools_on_auto_fast`: auto-fast not tools-verified — code=model_not_tool_capable (Cursor agents may need gpt-5.5 / whitelist)

## How to re-run

```bash
node scripts/p985-openai-cursor-compat-gap-smoke.mjs
# LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p985-openai-cursor-compat-gap-smoke.mjs
```
