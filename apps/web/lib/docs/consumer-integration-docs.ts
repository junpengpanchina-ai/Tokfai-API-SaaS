export type ConsumerDocNavItem = {
  id: string;
  title: { zh: string; en: string };
  description: { zh: string; en: string };
};

export type ConsumerDocStep = {
  title: { zh: string; en: string };
  code?: string;
  body?: { zh: string; en: string };
  successFlag?: string;
};

export type ConsumerDocError = {
  code: string;
  meaning: { zh: string; en: string };
  fix: { zh: string; en: string };
};

export type ConsumerDocSection = {
  id: string;
  title: { zh: string; en: string };
  intro?: { zh: string; en: string };
  bullets?: Array<{ zh: string; en: string }>;
  steps?: ConsumerDocStep[];
  code?: string;
  note?: { zh: string; en: string };
};

export const CONSUMER_DOC_NAV: ConsumerDocNavItem[] = [
  {
    id: "quickstart",
    title: { zh: "快速开始", en: "Quickstart" },
    description: {
      zh: "创建 Key、选接口、发第一次请求",
      en: "Create a key, pick an endpoint, send your first call",
    },
  },
  {
    id: "authentication",
    title: { zh: "API Key 与鉴权", en: "API key & auth" },
    description: {
      zh: "Bearer 鉴权格式与注意事项",
      en: "Bearer header format and rules",
    },
  },
  {
    id: "chat-completions",
    title: { zh: "文本对话 API", en: "Chat API" },
    description: {
      zh: "OpenAI 兼容文本对话",
      en: "OpenAI-compatible chat",
    },
  },
  {
    id: "responses-api",
    title: { zh: "Responses API", en: "Responses API" },
    description: {
      zh: "复杂推理与工具调用场景",
      en: "Reasoning and tool-use workflows",
    },
  },
  {
    id: "image-api",
    title: { zh: "图片生成 API", en: "Image API" },
    description: {
      zh: "文生图与参考图改图",
      en: "Text-to-image and reference edit",
    },
  },
  {
    id: "engineering-analysis",
    title: { zh: "工程类分析", en: "Engineering analysis" },
    description: {
      zh: "PDF、日志、代码与客户材料分析",
      en: "PDFs, logs, code, and customer materials",
    },
  },
  {
    id: "cherry-studio",
    title: { zh: "Cherry Studio 接入", en: "Cherry Studio" },
    description: {
      zh: "只配置 Tokfai 自定义供应商",
      en: "Use only the custom Tokfai provider",
    },
  },
  {
    id: "cursor",
    title: { zh: "Cursor 接入", en: "Cursor" },
    description: {
      zh: "OpenAI Compatible 配置",
      en: "OpenAI Compatible setup",
    },
  },
  {
    id: "common-errors",
    title: { zh: "常见错误", en: "Common errors" },
    description: {
      zh: "鉴权、文件与上游繁忙",
      en: "Auth, files, and upstream busy",
    },
  },
];

export const CONSUMER_DOC_COMMON_ERRORS: ConsumerDocError[] = [
  {
    code: "Missing Bearer token",
    meaning: {
      zh: "请求没有传 Authorization",
      en: "No Authorization header was sent",
    },
    fix: {
      zh: "加上 Authorization: Bearer sk-tokfai_xxx",
      en: "Add Authorization: Bearer sk-tokfai_xxx",
    },
  },
  {
    code: "invalid_token",
    meaning: {
      zh: "API Key 错误或已失效",
      en: "API key is wrong or expired",
    },
    fix: {
      zh: "到控制台重新复制 sk-tokfai_… Key",
      en: "Re-copy your sk-tokfai_… key from the dashboard",
    },
  },
  {
    code: "FILE_NOT_FOUND",
    meaning: {
      zh: "本地文件路径不正确",
      en: "Local file path is incorrect",
    },
    fix: {
      zh: "检查 --path 是否指向真实文件或文件夹",
      en: "Check that --path points to a real file or folder",
    },
  },
  {
    code: "NO_EXTRACTED_TEXT",
    meaning: {
      zh: "文件没有可读取文本，可能是扫描件或图片 PDF",
      en: "No readable text — scanned or image-only PDF",
    },
    fix: {
      zh: "换可复制的文本文件，或先做 OCR",
      en: "Use text-based files, or OCR the PDF first",
    },
  },
  {
    code: "body too large",
    meaning: {
      zh: "文件内容过大",
      en: "Uploaded content is too large",
    },
    fix: {
      zh: "减少文件数量或缩小分析范围",
      en: "Upload fewer files or narrow the scope",
    },
  },
  {
    code: "upstream busy",
    meaning: {
      zh: "模型繁忙",
      en: "Upstream model is busy",
    },
    fix: {
      zh: "稍后重试，或换模型",
      en: "Retry later or switch model",
    },
  },
];

const QUICKSTART_CURL = `curl https://api.tokfai.com/v1/models \\
  -H "Authorization: Bearer sk-tokfai_xxx"`;

const CHAT_CURL = `curl https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto-fast",
    "stream": false,
    "messages": [
      { "role": "user", "content": "Say OK only." }
    ]
  }'`;

const RESPONSES_CURL = `curl https://api.tokfai.com/v1/responses \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5.5",
    "input": "Say OK in one short sentence.",
    "stream": false
  }'`;

const IMAGE_CURL = `curl https://api.tokfai.com/v1/images/generations \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "nano-banana",
    "prompt": "A clean product photo on white background",
    "size": "1024x1024",
    "n": 1,
    "response_format": "url"
  }'`;

const UAV_API_KEY = `export TOKFAI_API_KEY="sk-tokfai_xxx"`;

const UAV_ANALYZE = `python3 scripts/aviation/tokfai-uav-intake.py \\
  --path "把文件拖到这里" \\
  --question "请分析这份无人机材料，重点看审批、空域、安全边界、飞控、姿态环、油门/电机输出和可交付风险"`;

export const CONSUMER_DOC_SECTIONS: ConsumerDocSection[] = [
  {
    id: "quickstart",
    title: { zh: "快速开始", en: "Quickstart" },
    intro: {
      zh: "三步完成首次接入：创建 Key → 选择接口 → 在请求里指定模型。",
      en: "Three steps: create a key → pick an endpoint → set model in each request.",
    },
    steps: [
      {
        title: { zh: "创建 API Key", en: "Create an API key" },
        body: {
          zh: "在控制台创建 sk-tokfai_xxx。Key 只负责鉴权，不绑定模型。",
          en: "Create sk-tokfai_xxx in the dashboard. Keys authenticate only — they are not bound to a model.",
        },
      },
      {
        title: { zh: "选择接口", en: "Pick an endpoint" },
        body: {
          zh: "文本对话用 /v1/chat/completions 或 /v1/responses；图片生成用 /v1/images/generations。",
          en: "Chat: /v1/chat/completions or /v1/responses. Images: /v1/images/generations.",
        },
      },
      {
        title: { zh: "验证连通性", en: "Verify connectivity" },
        code: QUICKSTART_CURL,
        successFlag: "200 OK",
      },
    ],
    note: {
      zh: "成功请求按用量扣算力积分；失败通常不扣费。用 request_id 在 Usage 对账。",
      en: "Successful calls debit compute credits; failures are usually not charged. Reconcile with request_id in Usage.",
    },
  },
  {
    id: "authentication",
    title: { zh: "API Key 与鉴权", en: "API key & auth" },
    intro: {
      zh: "所有公开 API 使用 Bearer 鉴权。",
      en: "All public APIs use Bearer authentication.",
    },
    code: `Authorization: Bearer sk-tokfai_xxx`,
    bullets: [
      {
        zh: "Base URL：https://api.tokfai.com（客户端常填 https://api.tokfai.com/v1）",
        en: "Base URL: https://api.tokfai.com (clients often use https://api.tokfai.com/v1)",
      },
      {
        zh: "Dashboard 登录会话不能代替 API Key 调用公开接口",
        en: "Dashboard session tokens cannot replace API keys on public endpoints",
      },
      {
        zh: "不要把 Key 写进前端公开仓库",
        en: "Never commit keys to public frontend repos",
      },
    ],
  },
  {
    id: "chat-completions",
    title: { zh: "文本对话 API", en: "Chat API" },
    intro: {
      zh: "POST /v1/chat/completions — OpenAI Chat Completions 兼容，适合普通对话与多轮问答。",
      en: "POST /v1/chat/completions — OpenAI Chat Completions compatible for chat and multi-turn Q&A.",
    },
    code: CHAT_CURL,
    bullets: [
      {
        zh: "model：每次请求指定，推荐 auto-fast / auto-pro / auto-cheap",
        en: "model: set per request; try auto-fast / auto-pro / auto-cheap",
      },
      {
        zh: "stream: false 返回 JSON，true 返回 SSE 流",
        en: "stream: false → JSON; true → SSE stream",
      },
    ],
  },
  {
    id: "responses-api",
    title: { zh: "Responses API", en: "Responses API" },
    intro: {
      zh: "POST /v1/responses — 适合复杂推理、MATLAB / Codex 类客户端与工具调用场景。",
      en: "POST /v1/responses — for complex reasoning, MATLAB/Codex-style clients, and tool use.",
    },
    code: RESPONSES_CURL,
    bullets: [
      {
        zh: "使用 input 字段（不是 messages）",
        en: "Use the input field (not messages)",
      },
      {
        zh: "鉴权格式与 Chat API 相同",
        en: "Same Authorization format as Chat API",
      },
    ],
  },
  {
    id: "image-api",
    title: { zh: "图片生成 API", en: "Image API" },
    intro: {
      zh: "POST /v1/images/generations — 文生图；提交后轮询 GET /v1/images/generations/:task_id 获取结果。",
      en: "POST /v1/images/generations — text-to-image; poll GET /v1/images/generations/:task_id for results.",
    },
    code: IMAGE_CURL,
    bullets: [
      {
        zh: "推荐模型：nano-banana",
        en: "Recommended model: nano-banana",
      },
      {
        zh: "异步任务：先拿到 task_id，再轮询直到 status=completed",
        en: "Async: get task_id first, then poll until status=completed",
      },
    ],
  },
  {
    id: "engineering-analysis",
    title: { zh: "工程类分析", en: "Engineering analysis" },
    intro: {
      zh: "适合处理 PDF、审批意见、飞控日志、代码文件、运行记录、客户材料等场景。系统会先读取文件内容，再交给 Tokfai 模型分析，避免只看到文件名、不读取文件内容的问题。",
      en: "For PDFs, approval notes, flight-control logs, code, run records, and customer materials. Tokfai reads file content first, then analyzes — not just filenames.",
    },
    bullets: [
      {
        zh: "必须通过脚本或上传接口让 Tokfai 读取文件内容",
        en: "Always upload or use the intake script so Tokfai reads file content",
      },
      {
        zh: "不要把文件名直接发给模型当分析材料",
        en: "Do not send filenames alone as analysis input",
      },
    ],
  },
  {
    id: "uav-material-analysis",
    title: { zh: "无人机材料分析", en: "UAV material analysis" },
    intro: {
      zh: "适合无人机项目中的飞行审批、空域限制、飞控代码、姿态控制、链路日志、安全边界和可交付风险分析。",
      en: "For flight approvals, airspace limits, FC code, attitude control, link logs, safety boundaries, and delivery risk in UAV projects.",
    },
    steps: [
      {
        title: { zh: "步骤 1：准备 API Key", en: "Step 1: Set API key" },
        code: UAV_API_KEY,
      },
      {
        title: { zh: "步骤 2：分析文件", en: "Step 2: Analyze files" },
        code: UAV_ANALYZE,
      },
      {
        title: { zh: "步骤 3：查看结果", en: "Step 3: Read results" },
        body: {
          zh: "成功标志：TOKFAI_P1284_CLIENT_INTAKE_DONE\n结果文件：tokfai-uav-diagnosis-YYYYMMDD-HHMMSS.md",
          en: "Success flag: TOKFAI_P1284_CLIENT_INTAKE_DONE\nOutput file: tokfai-uav-diagnosis-YYYYMMDD-HHMMSS.md",
        },
        successFlag: "TOKFAI_P1284_CLIENT_INTAKE_DONE",
      },
    ],
    bullets: [
      {
        zh: "支持 txt、md、log、json、csv、c、h、cpp、hpp、cc、hh、py、m、pdf",
        en: "Supports txt, md, log, json, csv, c, h, cpp, hpp, cc, hh, py, m, pdf",
      },
      {
        zh: "PDF 由服务器读取，客户不需要自己安装 poppler",
        en: "PDFs are read on the server — no local poppler install needed",
      },
      {
        zh: "扫描件或纯图片 PDF 可能返回 NO_EXTRACTED_TEXT",
        en: "Scanned or image-only PDFs may return NO_EXTRACTED_TEXT",
      },
      {
        zh: "不要只把文件名发给模型，必须通过脚本或上传接口让 Tokfai 读取文件内容",
        en: "Never send filenames only — use the script or upload API so Tokfai reads content",
      },
    ],
  },
  {
    id: "cherry-studio",
    title: { zh: "Cherry Studio 接入", en: "Cherry Studio" },
    intro: {
      zh: "只配置 Tokfai 自定义供应商，不要使用 Cherry Studio 内置 OpenAI / Gemini 供应商。",
      en: "Configure only a custom Tokfai provider — not built-in OpenAI / Gemini.",
    },
    bullets: [
      {
        zh: "供应商类型：OpenAI Compatible",
        en: "Provider type: OpenAI Compatible",
      },
      {
        zh: "Base URL：https://api.tokfai.com/v1",
        en: "Base URL: https://api.tokfai.com/v1",
      },
      {
        zh: "模型必须从 Tokfai 供应商下选择（顶部显示 | Tokfai）",
        en: "Pick models under the Tokfai provider (header shows | Tokfai)",
      },
      {
        zh: "测试 Prompt：只回答 TOKFAI_READY，不要解释。",
        en: 'Test prompt: Reply with TOKFAI_READY only.',
      },
    ],
  },
  {
    id: "cursor",
    title: { zh: "Cursor 接入", en: "Cursor" },
    intro: {
      zh: "在 Cursor 中添加 OpenAI Compatible 供应商。",
      en: "Add an OpenAI Compatible provider in Cursor.",
    },
    bullets: [
      {
        zh: "Base URL：https://api.tokfai.com/v1",
        en: "Base URL: https://api.tokfai.com/v1",
      },
      {
        zh: "API Key：控制台 sk-tokfai_…",
        en: "API Key: sk-tokfai_… from the dashboard",
      },
      {
        zh: "首次验证推荐模型：auto-fast",
        en: "First test model: auto-fast",
      },
      {
        zh: "成功后到 Usage 核对 request_id 与扣费",
        en: "After success, reconcile request_id and charges in Usage",
      },
    ],
  },
];
