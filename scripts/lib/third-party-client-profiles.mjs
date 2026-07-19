/**
 * Per-client profiles for Tokfai third-party offline smokes (p920–p928).
 * Docs + OpenAI-compatible contract only — never hits real upstream by default.
 */

export const TOKFAI_API_V1 = "https://api.tokfai.com/v1";

export const REQUIRED_MODEL_IDS = [
  "gpt-5",
  "gpt-5.4",
  "gpt-5-pro",
  "gpt-5.4-pro",
  "gpt-5.5",
  "gemini-3-pro",
  "gemini-2.5-flash",
];

export const CLIENT_ERROR_CODES = [
  "model_not_available",
  "insufficient_credits",
  "rate_limited",
  "upstream_busy",
];

/** Forbidden host / vendor tokens in third-party client docs. */
export const FORBIDDEN_DOC_HOSTS = [
  /grsaiapi\.com/i,
  /openai\.com\/v1/i,
  /generativelanguage\.googleapis\.com/i,
  /googleapis\.com/i,
];

/**
 * @typedef {object} ThirdPartyClientProfile
 * @property {string} id
 * @property {string} name
 * @property {string} passToken
 * @property {string} failToken
 * @property {string[]} docPhrases
 * @property {Record<string, string>} [headers]
 * @property {object} chatBody
 * @property {string} [expectResolved]
 */

/** @type {Record<string, ThirdPartyClientProfile>} */
export const THIRD_PARTY_CLIENT_PROFILES = {
  "cherry-studio": {
    id: "cherry-studio",
    name: "Cherry Studio",
    passToken: "TOKFAI_P920_CHERRY_STUDIO_CLIENT_PASS",
    failToken: "TOKFAI_P920_CHERRY_STUDIO_CLIENT_FAIL",
    docPhrases: [
      "Cherry Studio",
      "OpenAI Compatible",
      TOKFAI_API_V1,
      "| tokfai",
      "Tokfai GPT-5",
      "Tokfai GPT-5.4 Pro | Tokfai",
      "不要选择 OpenAI / Gemini 内置供应商",
      "如果请求路径不是 api.tokfai.com，说明没有走 Tokfai",
      "gpt-5.4-pro",
      "gpt-5.4",
      "model_not_available",
      "insufficient_credits",
      "rate_limited",
      "upstream_busy",
    ],
    headers: { "User-Agent": "CherryStudio/1.0 TokfaiCompatSmoke" },
    chatBody: {
      model: "gpt-5.4-pro",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
      temperature: 0.2,
      max_tokens: 64,
    },
    expectResolved: "gpt-5-pro",
  },
  chatbox: {
    id: "chatbox",
    name: "Chatbox",
    passToken: "TOKFAI_P921_CHATBOX_CLIENT_PASS",
    failToken: "TOKFAI_P921_CHATBOX_CLIENT_FAIL",
    docPhrases: [
      "Chatbox",
      TOKFAI_API_V1,
      "gpt-5.5",
      "gemini-3-pro",
      "model_not_available",
      "insufficient_credits",
      "rate_limited",
      "upstream_busy",
    ],
    headers: { "User-Agent": "Chatbox/1.0 TokfaiCompatSmoke" },
    chatBody: {
      model: "gpt-5.5",
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Say ok only." },
      ],
      stream: false,
      top_p: 1,
    },
    expectResolved: "gpt-5.5",
  },
  nextchat: {
    id: "nextchat",
    name: "NextChat",
    passToken: "TOKFAI_P922_NEXTCHAT_CLIENT_PASS",
    failToken: "TOKFAI_P922_NEXTCHAT_CLIENT_FAIL",
    docPhrases: [
      "NextChat",
      TOKFAI_API_V1,
      "gpt-5",
      "gemini-2.5-flash",
      "model_not_available",
      "insufficient_credits",
      "rate_limited",
      "upstream_busy",
    ],
    headers: { "User-Agent": "NextChat/1.0 TokfaiCompatSmoke" },
    chatBody: {
      model: "gpt-5",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
      max_completion_tokens: 64,
    },
    expectResolved: "gpt-5",
  },
  openwebui: {
    id: "openwebui",
    name: "OpenWebUI",
    passToken: "TOKFAI_P923_OPENWEBUI_CLIENT_PASS",
    failToken: "TOKFAI_P923_OPENWEBUI_CLIENT_FAIL",
    docPhrases: [
      "OpenWebUI",
      TOKFAI_API_V1,
      "gpt-5.4",
      "gemini-3-pro",
      "model_not_available",
      "insufficient_credits",
      "rate_limited",
      "upstream_busy",
    ],
    headers: { "User-Agent": "OpenWebUI/1.0 TokfaiCompatSmoke" },
    chatBody: {
      model: "gpt-5.4",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
      user: "openwebui-smoke",
    },
    expectResolved: "gpt-5",
  },
  dify: {
    id: "dify",
    name: "Dify",
    passToken: "TOKFAI_P924_DIFY_CLIENT_PASS",
    failToken: "TOKFAI_P924_DIFY_CLIENT_FAIL",
    docPhrases: [
      "Dify",
      TOKFAI_API_V1,
      "OpenAI-API-compatible",
      "gpt-5.5",
      "model_not_available",
      "insufficient_credits",
      "rate_limited",
      "upstream_busy",
    ],
    headers: { "User-Agent": "Dify/1.0 TokfaiCompatSmoke" },
    chatBody: {
      model: "gpt-5.5",
      messages: [
        { role: "system", content: "You are a workflow assistant." },
        { role: "user", content: "Say ok only." },
      ],
      stream: false,
      user: "dify-app-user",
      temperature: 0,
    },
    expectResolved: "gpt-5.5",
  },
  fastgpt: {
    id: "fastgpt",
    name: "FastGPT",
    passToken: "TOKFAI_P925_FASTGPT_CLIENT_PASS",
    failToken: "TOKFAI_P925_FASTGPT_CLIENT_FAIL",
    docPhrases: [
      "FastGPT",
      TOKFAI_API_V1,
      "gpt-5-pro",
      "gemini-2.5-flash",
      "model_not_available",
      "insufficient_credits",
      "rate_limited",
      "upstream_busy",
    ],
    headers: { "User-Agent": "FastGPT/1.0 TokfaiCompatSmoke" },
    chatBody: {
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
      presence_penalty: 0,
      frequency_penalty: 0,
    },
    expectResolved: "gemini-2.5-flash",
  },
  continue: {
    id: "continue",
    name: "Continue",
    passToken: "TOKFAI_P926_CONTINUE_CLIENT_PASS",
    failToken: "TOKFAI_P926_CONTINUE_CLIENT_FAIL",
    docPhrases: [
      "Continue",
      TOKFAI_API_V1,
      "apiBase",
      "gpt-5.5",
      "model_not_available",
      "insufficient_credits",
      "rate_limited",
      "upstream_busy",
    ],
    headers: { "User-Agent": "Continue/1.0 TokfaiCompatSmoke" },
    chatBody: {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
      max_tokens: 128,
    },
    expectResolved: "gpt-5.5",
  },
  cline: {
    id: "cline",
    name: "Cline",
    passToken: "TOKFAI_P927_CLINE_CLIENT_PASS",
    failToken: "TOKFAI_P927_CLINE_CLIENT_FAIL",
    docPhrases: [
      "Cline",
      TOKFAI_API_V1,
      "OpenAI Compatible",
      "gpt-5.5",
      "model_not_available",
      "insufficient_credits",
      "rate_limited",
      "upstream_busy",
    ],
    headers: { "User-Agent": "Cline/1.0 TokfaiCompatSmoke" },
    chatBody: {
      model: "gpt-5-pro",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
      temperature: 0,
    },
    expectResolved: "gpt-5-pro",
  },
  "roo-code": {
    id: "roo-code",
    name: "Roo Code",
    passToken: "TOKFAI_P928_ROO_CODE_CLIENT_PASS",
    failToken: "TOKFAI_P928_ROO_CODE_CLIENT_FAIL",
    docPhrases: [
      "Roo Code",
      TOKFAI_API_V1,
      "gpt-5.4-pro",
      "gpt-5-pro",
      "model_not_available",
      "insufficient_credits",
      "rate_limited",
      "upstream_busy",
    ],
    headers: { "User-Agent": "RooCode/1.0 TokfaiCompatSmoke" },
    chatBody: {
      model: "gpt-5.4-pro",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
      max_completion_tokens: 96,
    },
    expectResolved: "gpt-5-pro",
  },
};
