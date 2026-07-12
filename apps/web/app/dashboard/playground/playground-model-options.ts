export type PlaygroundChatModelOption = {
  id: string;
  displayName: string;
  description: string;
};

/** Concrete chat models shown in Playground (consumer curated). */
const PLAYGROUND_CHAT_MODELS: PlaygroundChatModelOption[] = [
  {
    id: "gpt-5.5",
    displayName: "GPT 5.5",
    description: "Premium GPT 5.5 chat model for demanding applications.",
  },
  {
    id: "gemini-3-flash",
    displayName: "Gemini 3 Flash",
    description: "Fast Gemini 3 chat model for low-latency responses.",
  },
  {
    id: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    description: "Efficient Gemini 2.5 flash model for everyday chat.",
  },
  {
    id: "gemini-3-pro",
    displayName: "Gemini 3 Pro",
    description: "Gemini 3 Pro chat model for general-purpose conversations.",
  },
  {
    id: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    description: "Gemini 2.5 Pro for higher-quality chat completions.",
  },
];

export const PLAYGROUND_CHAT_MODEL_IDS = [
  "auto-fast",
  "auto-pro",
  "auto-cheap",
  "gpt-5",
  ...PLAYGROUND_CHAT_MODELS.map((m) => m.id),
] as const;

export function isAvailableChatModel(modelId: string): boolean {
  return (PLAYGROUND_CHAT_MODEL_IDS as readonly string[]).includes(modelId);
}

export function getChatModelById(
  modelId: string
): PlaygroundChatModelOption | undefined {
  return PLAYGROUND_CHAT_MODELS.find((model) => model.id === modelId);
}
