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
      zh: "上传工程包、PDF、日志、代码等材料，Tokfai 读取文件内容后生成诊断报告。",
      en: "Upload project archives, PDFs, logs, and code. Tokfai reads file content and produces a diagnosis report.",
    },
    cta: { zh: "查看工程分析", en: "View engineering analysis" },
    href: "#engineering-analysis",
  },
  {
    id: "api",
    title: { zh: "API 接入", en: "API integration" },
    description: {
      zh: "OpenAI 兼容接口：/v1/models、/v1/chat/completions、/v1/responses、/v1/images/generations。",
      en: "OpenAI-compatible endpoints: /v1/models, /v1/chat/completions, /v1/responses, /v1/images/generations.",
    },
    cta: { zh: "查看 API 文档", en: "View API docs" },
    href: "#api-access",
  },
  {
    id: "client",
    title: { zh: "客户端配置", en: "Client configuration" },
    description: {
      zh: "Codex、Cursor、Cherry Studio 等工具连接 Tokfai API。",
      en: "Connect Codex, Cursor, Cherry Studio, and similar tools to Tokfai.",
    },
    cta: { zh: "查看客户端配置", en: "View client setup" },
    href: "#client-config",
  },
];

export const ENGINEERING_INTRO = {
  zh: "Tokfai 不能直接读取用户电脑上的本地路径，必须上传真实文件或工程包。",
  en: "Tokfai cannot read local paths on your computer. Upload real files or a project archive.",
};

export const UAV_WORKFLOW_STEPS: Array<{ zh: string; en: string }> = [
  { zh: "上传材料", en: "Upload materials" },
  { zh: "读取文件内容", en: "Extract file content" },
  { zh: "模型分析", en: "Model analysis" },
  { zh: "输出 markdown 诊断报告", en: "Output markdown diagnosis report" },
];

export const UAV_SUPPORTED_FORMATS = {
  zh: "zip、PDF、txt、md、log、json、csv、c、cpp、h、py、m 等",
  en: "zip, PDF, txt, md, log, json, csv, c, cpp, h, py, m, and more",
};

export const UAV_ANALYSIS_SCOPE: Array<{ zh: string; en: string }> = [
  { zh: "飞行审批", en: "Flight approval" },
  { zh: "空域限制", en: "Airspace restrictions" },
  { zh: "飞控代码", en: "Flight-control code" },
  { zh: "姿态控制", en: "Attitude control" },
  { zh: "任务调度", en: "Task scheduling" },
  { zh: "控制分配", en: "Control allocation" },
  { zh: "电机/油门输出", en: "Motor / throttle output" },
  { zh: "安全边界", en: "Safety boundaries" },
  { zh: "日志诊断", en: "Log diagnostics" },
];

export const UAV_SCRIPT_EXAMPLE = `export TOKFAI_API_KEY="sk-tokfai_xxx"
python3 scripts/aviation/tokfai-uav-intake.py \\
  --path "/你的工程目录" \\
  --question "请分析无人机工程材料，重点看审批、空域、安全边界、飞控、姿态环、油门/电机输出和交付风险"`;

export const UAV_OUTPUT_FILE = "tokfai-uav-diagnosis-YYYYMMDD-HHMMSS.md";

export const PATH_WARNING = {
  title: {
    zh: "为什么只输入路径读不了文件？",
    en: "Why can't Tokfai read a path you type?",
  },
  body: {
    zh: "本地路径只存在于你的电脑，Tokfai 云端无法直接读取。只发送 Flight/FlightControl/txg_control_task.c 这样的路径字符串时，Tokfai 收到的是文本，不是文件内容。必须通过脚本上传或上传接口把文件内容传给 Tokfai。",
    en: "Local paths exist only on your machine — Tokfai in the cloud cannot read them. Sending a path like Flight/FlightControl/txg_control_task.c delivers text, not file content. Upload files via the intake script or upload API.",
  },
};

export const API_ENDPOINTS: Array<{
  method: string;
  path: string;
  note: { zh: string; en: string };
}> = [
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
    meaning: { zh: "没有传 Authorization", en: "No Authorization header" },
  },
  {
    code: "invalid_token",
    meaning: { zh: "API Key 错误或过期", en: "API key wrong or expired" },
  },
  {
    code: "404",
    meaning: {
      zh: "base_url 配错，使用 https://api.tokfai.com/v1",
      en: "Wrong base_url — use https://api.tokfai.com/v1",
    },
  },
  {
    code: "stream disconnected",
    meaning: {
      zh: "客户端或本地代理中断，关闭代理后重试",
      en: "Client or proxy interrupted — disable proxy and retry",
    },
  },
  {
    code: "model_not_available",
    meaning: {
      zh: "模型名不在 Tokfai 模型列表",
      en: "Model id not in Tokfai model list",
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
    title: { zh: "Codex", en: "Codex" },
    blocks: [
      {
        heading: { zh: "config.toml", en: "config.toml" },
        code: CODEX_CONFIG_TOML,
      },
      {
        heading: { zh: "auth.json", en: "auth.json" },
        body: {
          zh: "~/.codex/auth.json",
          en: "~/.codex/auth.json",
        },
        code: CODEX_AUTH_JSON,
      },
      {
        heading: { zh: "测试", en: "Test" },
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
    title: { zh: "Cursor", en: "Cursor" },
    blocks: [
      {
        heading: { zh: "连接参数", en: "Connection" },
        bullets: [
          { zh: "Base URL: https://api.tokfai.com/v1", en: "Base URL: https://api.tokfai.com/v1" },
          { zh: "API Key: sk-tokfai_xxx", en: "API Key: sk-tokfai_xxx" },
          {
            zh: "Model: gpt-5.5 或模型页中的模型 id",
            en: "Model: gpt-5.5 or a model id from Models",
          },
        ],
      },
      {
        heading: { zh: "本地文件", en: "Local files" },
        body: {
          zh: "Cursor 是否分析本地文件，取决于它是否把文件内容放进请求。Tokfai 只处理已传到 API 的内容。",
          en: "Whether Cursor analyzes local files depends on it sending file content in the request. Tokfai only processes what reaches the API.",
        },
      },
    ],
  },
  {
    id: "cherry-studio",
    title: { zh: "Cherry Studio", en: "Cherry Studio" },
    blocks: [
      {
        heading: { zh: "连接参数", en: "Connection" },
        bullets: [
          { zh: "Provider: OpenAI Compatible", en: "Provider: OpenAI Compatible" },
          { zh: "Base URL: https://api.tokfai.com/v1", en: "Base URL: https://api.tokfai.com/v1" },
          { zh: "API Key: sk-tokfai_xxx", en: "API Key: sk-tokfai_xxx" },
          { zh: "模型从 /v1/models 获取", en: "Fetch models from /v1/models" },
        ],
      },
    ],
  },
];
