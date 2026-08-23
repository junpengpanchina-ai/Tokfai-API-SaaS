export type ConsumerDocError = {
  code: string;
  meaning: { zh: string; en: string };
  fix: { zh: string; en: string };
};

export type HeroCard = {
  id: string;
  title: { zh: string; en: string };
  description: { zh: string; en: string };
  cta: { zh: string; en: string };
  href: string;
};

export const SOLUTION_HERO_CARDS: HeroCard[] = [
  {
    id: "engineering",
    title: { zh: "工程材料分析", en: "Engineering material analysis" },
    description: {
      zh: "上传 PDF、审批意见、日志、代码、CSV、JSON 等材料，Tokfai 会先读取文件内容，再交给模型生成诊断报告。",
      en: "Upload PDFs, approvals, logs, code, CSV, JSON, and more. Tokfai reads file content first, then generates a diagnosis report.",
    },
    cta: { zh: "查看工程分析", en: "View engineering analysis" },
    href: "#engineering-analysis",
  },
  {
    id: "api",
    title: { zh: "API 接入", en: "API integration" },
    description: {
      zh: "适合开发者通过 OpenAI 兼容接口接入 /v1/models、/v1/chat/completions、/v1/responses、/v1/images/generations。",
      en: "For developers using OpenAI-compatible endpoints: /v1/models, /v1/chat/completions, /v1/responses, /v1/images/generations.",
    },
    cta: { zh: "查看 API 文档", en: "View API docs" },
    href: "#api-access",
  },
  {
    id: "client",
    title: { zh: "客户端接入", en: "Client integration" },
    description: {
      zh: "适合 Cherry Studio、Cursor、脚本工具等客户端调用 Tokfai。",
      en: "For Cherry Studio, Cursor, scripts, and other clients calling Tokfai.",
    },
    cta: { zh: "查看客户端配置", en: "View client setup" },
    href: "#upstream-config",
  },
];

export const UPSTREAM_CONFIG_SUBTITLE = {
  zh: "适合需要在 Codex、Cursor、Cherry Studio 等工具中调用 Tokfai 的工程师客户。普通材料分析客户优先使用上方「工程材料分析」。",
  en: "For engineers using Codex, Cursor, Cherry Studio, and similar tools with Tokfai. For material analysis, use Engineering material analysis above first.",
};

export const CODEX_CONFIG_TOML = `model = "gpt-5.5"
model_provider = "openai"
openai_base_url = "https://api.tokfai.com/v1"`;

export const CODEX_AUTH_JSON = `{
  "OPENAI_API_KEY": "sk-tokfai_xxx"
}`;

export const CODEX_TEST_CURL = `curl -sS https://api.tokfai.com/v1/models

curl -sS https://api.tokfai.com/v1/responses \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-5.5","input":"回复 TOKFAI_AUTH_OK","stream":false}'`;

export const CODEX_COMMON_ERRORS: Array<{
  code: string;
  meaning: { zh: string; en: string };
}> = [
  {
    code: "Missing Bearer token",
    meaning: { zh: "没有传 Authorization", en: "No Authorization header was sent" },
  },
  {
    code: "invalid_token",
    meaning: { zh: "API Key 错误或过期", en: "API key is wrong or expired" },
  },
  {
    code: "404",
    meaning: {
      zh: "base_url 配错，注意要使用 https://api.tokfai.com/v1",
      en: "Wrong base_url — use https://api.tokfai.com/v1",
    },
  },
  {
    code: "stream disconnected",
    meaning: {
      zh: "客户端或本地代理中断，先关闭代理/重启客户端后再测",
      en: "Client or local proxy interrupted — disable proxy and restart the client",
    },
  },
  {
    code: "model_not_available",
    meaning: {
      zh: "模型名不在 Tokfai 模型列表",
      en: "Model id is not in the Tokfai model list",
    },
  },
];

export type UpstreamConfigBlock = {
  heading: { zh: string; en: string };
  body?: { zh: string; en: string };
  code?: string;
  bullets?: Array<{ zh: string; en: string }>;
  errors?: Array<{ code: string; meaning: { zh: string; en: string } }>;
};

export type UpstreamClientConfig = {
  id: string;
  title: { zh: string; en: string };
  blocks: UpstreamConfigBlock[];
};

export const UPSTREAM_CLIENT_CONFIGS: UpstreamClientConfig[] = [
  {
    id: "codex",
    title: { zh: "Codex 配置 Tokfai", en: "Codex with Tokfai" },
    blocks: [
      {
        heading: { zh: "配置 config.toml", en: "config.toml" },
        code: CODEX_CONFIG_TOML,
      },
      {
        heading: { zh: "配置 auth.json", en: "auth.json" },
        body: {
          zh: "在本机 ~/.codex/auth.json 中填入 API Key。",
          en: "Put your API key in ~/.codex/auth.json on your machine.",
        },
        code: CODEX_AUTH_JSON,
      },
      {
        heading: { zh: "测试方式", en: "Test" },
        code: CODEX_TEST_CURL,
      },
      {
        heading: { zh: "常见报错", en: "Common errors" },
        errors: CODEX_COMMON_ERRORS,
      },
    ],
  },
  {
    id: "cursor",
    title: { zh: "Cursor 配置 Tokfai", en: "Cursor with Tokfai" },
    blocks: [
      {
        heading: { zh: "连接参数", en: "Connection" },
        bullets: [
          { zh: "Base URL: https://api.tokfai.com/v1", en: "Base URL: https://api.tokfai.com/v1" },
          { zh: "API Key: sk-tokfai_xxx", en: "API Key: sk-tokfai_xxx" },
          {
            zh: "Model: gpt-5.5 或模型页中展示的模型 id",
            en: "Model: gpt-5.5 or a model id from the Models page",
          },
        ],
      },
      {
        heading: { zh: "文件读取说明", en: "About local files" },
        body: {
          zh: "Cursor 只是客户端，真正能否读取本地文件，取决于 Cursor 是否把文件内容放进请求；Tokfai 只能分析已经传到 API 的内容。",
          en: "Cursor is only the client. Whether local files are analyzed depends on Cursor sending file content in the request. Tokfai can only analyze what reaches the API.",
        },
      },
    ],
  },
  {
    id: "cherry-studio",
    title: { zh: "Cherry Studio 配置 Tokfai", en: "Cherry Studio with Tokfai" },
    blocks: [
      {
        heading: { zh: "连接参数", en: "Connection" },
        bullets: [
          {
            zh: "Provider 类型选择 OpenAI Compatible",
            en: "Provider type: OpenAI Compatible",
          },
          {
            zh: "API Host / Base URL: https://api.tokfai.com/v1",
            en: "API Host / Base URL: https://api.tokfai.com/v1",
          },
          { zh: "API Key: sk-tokfai_xxx", en: "API Key: sk-tokfai_xxx" },
          {
            zh: "模型从 /v1/models 获取",
            en: "Fetch models from /v1/models",
          },
          {
            zh: "先用一句话测试，再测试长文本",
            en: "Test with one short sentence first, then longer text",
          },
        ],
      },
    ],
  },
];

export const UAV_WORKFLOW_STEPS: Array<{ zh: string; en: string }> = [
  { zh: "准备 API Key", en: "Prepare API key" },
  { zh: "把文件拖进终端或选择本地文件路径", en: "Drag files into terminal or pick a local path" },
  { zh: "运行分析脚本", en: "Run the analysis script" },
  { zh: "获取 markdown 诊断报告", en: "Get the markdown diagnosis report" },
];

export const UAV_API_KEY_CODE = `export TOKFAI_API_KEY="sk-tokfai_xxx"`;

export const UAV_ANALYZE_CODE = `python3 scripts/aviation/tokfai-uav-intake.py \\
  --path "把文件拖到这里" \\
  --question "请分析这份无人机材料，重点看审批、空域、安全边界、飞控、姿态环、油门/电机输出和可交付风险"`;

export const UAV_SUCCESS_FLAG = "TOKFAI_P1284_CLIENT_INTAKE_DONE";

export const UAV_OUTPUT_FILE = "tokfai-uav-diagnosis-YYYYMMDD-HHMMSS.md";

export const SUPPORTED_MATERIALS: Array<{ zh: string; en: string }> = [
  { zh: "飞行审批 PDF", en: "Flight approval PDFs" },
  { zh: "空域/航线限制材料", en: "Airspace / route restriction documents" },
  { zh: "飞控日志", en: "Flight-control logs" },
  { zh: "C/C++/Python/MATLAB 代码", en: "C/C++/Python/MATLAB code" },
  { zh: "设备参数、任务规划、异常记录", en: "Device params, mission plans, anomaly records" },
  { zh: "CSV、JSON、TXT、MD、LOG 文件", en: "CSV, JSON, TXT, MD, LOG files" },
];

export const CONSUMER_DOC_COMMON_ERRORS: ConsumerDocError[] = [
  {
    code: "Missing Bearer token",
    meaning: {
      zh: "没有传 Authorization",
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
      zh: "API Key 错误或过期",
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
      zh: "模型繁忙，稍后重试",
      en: "Upstream model is busy — retry later",
    },
    fix: {
      zh: "稍后重试，或换模型",
      en: "Retry later or switch model",
    },
  },
];

export const API_ENDPOINTS: Array<{ method: string; path: string; note: { zh: string; en: string } }> = [
  {
    method: "—",
    path: "https://api.tokfai.com",
    note: { zh: "Base URL", en: "Base URL" },
  },
  {
    method: "GET",
    path: "/v1/models",
    note: { zh: "列出可用模型", en: "List available models" },
  },
  {
    method: "POST",
    path: "/v1/chat/completions",
    note: { zh: "文本对话", en: "Chat completions" },
  },
  {
    method: "POST",
    path: "/v1/responses",
    note: { zh: "复杂推理 / Codex 类客户端", en: "Reasoning / Codex-style clients" },
  },
  {
    method: "POST",
    path: "/v1/images/generations",
    note: { zh: "图片生成", en: "Image generation" },
  },
];

