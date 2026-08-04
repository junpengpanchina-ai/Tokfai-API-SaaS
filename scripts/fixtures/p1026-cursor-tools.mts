/**
 * P1026 fixtures — Cursor-style multi-tool definitions + nested schemas.
 * REAL COMPILER/PARSER fixtures only (no LIVE upstream).
 */

export const P1026_WEATHER_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get weather",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string" },
          unit: { type: "string", enum: ["c", "f"] },
        },
        required: ["city"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_time",
      description: "Get time",
      parameters: {
        type: "object",
        properties: { tz: { type: "string" } },
        required: ["tz"],
        additionalProperties: false,
      },
    },
  },
] as const;

/** Deeply nested parameters Schema (scenario 20). */
export const P1026_DEEP_NESTED_TOOL = {
  type: "function",
  function: {
    name: "analyze_document",
    description: "Analyze a nested document structure",
    parameters: {
      type: "object",
      properties: {
        meta: {
          type: "object",
          properties: {
            source: { type: "string" },
            tags: {
              type: "array",
              items: { type: "string" },
            },
            author: {
              type: "object",
              properties: {
                name: { type: "string" },
                contact: {
                  type: "object",
                  properties: {
                    email: { type: "string" },
                    phones: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          kind: { type: "string" },
                          number: { type: "string" },
                        },
                        required: ["kind", "number"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["email"],
                  additionalProperties: false,
                },
              },
              required: ["name", "contact"],
              additionalProperties: false,
            },
          },
          required: ["source", "author"],
          additionalProperties: false,
        },
        options: {
          type: "object",
          properties: {
            depth: { type: "integer" },
            flags: {
              type: "object",
              properties: {
                includeImages: { type: "boolean" },
                language: { type: "string" },
              },
              required: ["includeImages"],
              additionalProperties: false,
            },
          },
          required: ["depth", "flags"],
          additionalProperties: false,
        },
      },
      required: ["meta", "options"],
      additionalProperties: false,
    },
  },
} as const;

/** 20+ Cursor-style tool definitions (scenario 19). */
export function buildCursorStyleTools(count = 22) {
  const tools: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> = [
    ...P1026_WEATHER_TOOLS.map((t) => ({
      type: "function" as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters as Record<string, unknown>,
      },
    })),
    {
      type: "function",
      function: {
        name: "Read",
        description: "Read a file from the workspace",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            offset: { type: "integer" },
            limit: { type: "integer" },
          },
          required: ["path"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "Write",
        description: "Write a file",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            contents: { type: "string" },
          },
          required: ["path", "contents"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "StrReplace",
        description: "Replace text in a file",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            old_string: { type: "string" },
            new_string: { type: "string" },
          },
          required: ["path", "old_string", "new_string"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "Shell",
        description: "Run a shell command",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string" },
            working_directory: { type: "string" },
          },
          required: ["command"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "Grep",
        description: "Search file contents",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string" },
            path: { type: "string" },
            glob: { type: "string" },
          },
          required: ["pattern"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "Glob",
        description: "Find files by glob",
        parameters: {
          type: "object",
          properties: {
            glob_pattern: { type: "string" },
          },
          required: ["glob_pattern"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "Delete",
        description: "Delete a file",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "TodoWrite",
        description: "Update todos",
        parameters: {
          type: "object",
          properties: {
            todos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  content: { type: "string" },
                  status: { type: "string" },
                },
                required: ["id", "content", "status"],
                additionalProperties: false,
              },
            },
            merge: { type: "boolean" },
          },
          required: ["todos", "merge"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "WebSearch",
        description: "Search the web",
        parameters: {
          type: "object",
          properties: {
            search_term: { type: "string" },
            explanation: { type: "string" },
          },
          required: ["search_term"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "WebFetch",
        description: "Fetch a URL",
        parameters: {
          type: "object",
          properties: { url: { type: "string" } },
          required: ["url"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "GenerateImage",
        description: "Generate an image",
        parameters: {
          type: "object",
          properties: {
            description: { type: "string" },
            filename: { type: "string" },
          },
          required: ["description"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "EditNotebook",
        description: "Edit a notebook cell",
        parameters: {
          type: "object",
          properties: {
            target_notebook: { type: "string" },
            cell_idx: { type: "integer" },
            is_new_cell: { type: "boolean" },
            cell_language: { type: "string" },
            old_string: { type: "string" },
            new_string: { type: "string" },
          },
          required: [
            "target_notebook",
            "cell_idx",
            "is_new_cell",
            "cell_language",
            "old_string",
            "new_string",
          ],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "AwaitShell",
        description: "Await a shell job",
        parameters: {
          type: "object",
          properties: {
            shell_id: { type: "string" },
            block_until_ms: { type: "integer" },
          },
          required: [],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "Task",
        description: "Launch a subagent",
        parameters: {
          type: "object",
          properties: {
            description: { type: "string" },
            prompt: { type: "string" },
            subagent_type: { type: "string" },
          },
          required: ["description", "prompt"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "SwitchMode",
        description: "Switch agent mode",
        parameters: {
          type: "object",
          properties: {
            target_mode_id: { type: "string" },
            explanation: { type: "string" },
          },
          required: ["target_mode_id"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "CallMcpTool",
        description: "Call an MCP tool",
        parameters: {
          type: "object",
          properties: {
            server: { type: "string" },
            toolName: { type: "string" },
          },
          required: ["server", "toolName"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "FetchMcpResource",
        description: "Fetch MCP resource",
        parameters: {
          type: "object",
          properties: {
            server: { type: "string" },
            uri: { type: "string" },
          },
          required: ["server", "uri"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "GetMcpTools",
        description: "List MCP tools",
        parameters: {
          type: "object",
          properties: {
            server: { type: "string" },
            pattern: { type: "string" },
          },
          required: [],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "ConnectScm",
        description: "Connect source control",
        parameters: {
          type: "object",
          properties: {
            github_repo: { type: "string" },
          },
          required: [],
          additionalProperties: false,
        },
      },
    },
  ];

  while (tools.length < count) {
    const i = tools.length + 1;
    tools.push({
      type: "function",
      function: {
        name: `cursor_extra_tool_${i}`,
        description: `Extra Cursor-style tool ${i}`,
        parameters: {
          type: "object",
          properties: {
            input: { type: "string" },
          },
          required: ["input"],
          additionalProperties: false,
        },
      },
    });
  }
  return tools.slice(0, count);
}

export function canonicalToolCall(
  name: string,
  args: Record<string, unknown>
): string {
  return JSON.stringify({
    type: "tool_call",
    tool_calls: [{ name, arguments: args }],
  });
}

export function canonicalMultiToolCall(
  calls: Array<{ name: string; arguments: Record<string, unknown> }>
): string {
  return JSON.stringify({ type: "tool_call", tool_calls: calls });
}

export function openaiToolCallsShape(
  name: string,
  args: Record<string, unknown> | string,
  opts?: { withRole?: boolean; content?: null | string }
): string {
  const item = {
    type: "function",
    function: {
      name,
      arguments:
        typeof args === "string" ? args : JSON.stringify(args),
    },
  };
  if (opts?.withRole) {
    return JSON.stringify({
      role: "assistant",
      content: opts.content === undefined ? null : opts.content,
      tool_calls: [item],
    });
  }
  return JSON.stringify({ tool_calls: [item] });
}

export function openaiToolCallsObjectArgs(
  name: string,
  args: Record<string, unknown>
): string {
  return JSON.stringify({
    tool_calls: [
      {
        type: "function",
        function: { name, arguments: args },
      },
    ],
  });
}
