import {
  DEFAULT_IMAGE_MODEL_ID,
  HIDDEN_INTERNAL_MODEL_IDS,
  isHiddenInternalModel,
  isKnownChatModelKind,
  listStaticSuggestedChatModelIds,
  listStaticSuggestedImageModelIds,
} from "../src/catalog/modelRegistry.js";
import { MODEL_ALIAS_CHAINS } from "../src/upstream/modelAliases.js";
import { getModelConfig } from "../src/upstream/modelCatalog.js";

function main(): void {
  const chat = listStaticSuggestedChatModelIds();
  const image = listStaticSuggestedImageModelIds();

  const checks = [
    {
      name: "hidden chat models disabled in static catalog",
      pass:
        getModelConfig("gpt-4o-mini")?.enabled === false &&
        isHiddenInternalModel("gpt-4o-mini") &&
        isHiddenInternalModel("test-admin-model-001"),
    },
    {
      name: "chat model kind blocked for image whitelist",
      pass: !listStaticSuggestedImageModelIds().includes("gemini-3-flash"),
    },
    {
      name: "gemini-3-flash is chat kind",
      pass: isKnownChatModelKind("gemini-3-flash"),
    },
    {
      name: "default image model is image kind",
      pass: image.includes(DEFAULT_IMAGE_MODEL_ID),
    },
    {
      name: "gemini-3.1 aliases map to gemini-3 chat models",
      pass:
        MODEL_ALIAS_CHAINS["gemini-3.1-flash"][0] === "gemini-3-flash" &&
        MODEL_ALIAS_CHAINS["gemini-3.1-pro"][0] === "gemini-3-pro",
    },
    {
      name: "auto-pro excludes gemini-3.1-pro from chain targets",
      pass: !MODEL_ALIAS_CHAINS["auto-pro"].includes("gemini-3.1-pro"),
    },
    {
      name: "gpt-5 family aliases map to gpt-5.5/gpt-5.4",
      pass:
        MODEL_ALIAS_CHAINS["gpt-5"][0] === "gpt-5.5" &&
        MODEL_ALIAS_CHAINS["gpt-5-chat"].includes("gpt-5.4") &&
        MODEL_ALIAS_CHAINS["gpt-5-pro"].includes("gpt-5.5") &&
        MODEL_ALIAS_CHAINS["gpt-5.1"].includes("gpt-5.5") &&
        MODEL_ALIAS_CHAINS["gpt-5.2"].includes("gpt-5.4"),
    },
    {
      name: "auto-fast includes gemini-2.5-flash",
      pass: MODEL_ALIAS_CHAINS["auto-fast"].includes("gemini-2.5-flash"),
    },
    {
      name: "static chat whitelist excludes hidden",
      pass: !chat.some((id) => HIDDEN_INTERNAL_MODEL_IDS.has(id)),
    },
  ];

  let failed = 0;
  for (const check of checks) {
    const mark = check.pass ? "PASS" : "FAIL";
    console.log(`${mark}  ${check.name}`);
    if (!check.pass) failed += 1;
  }

  console.log("");
  console.log("chat whitelist:", chat.join(", "));
  console.log("image whitelist:", image.join(", "));
  console.log("default image model:", DEFAULT_IMAGE_MODEL_ID);

  process.exit(failed > 0 ? 1 : 0);
}

main();
