/**
 * P769 — Industry API integration templates (client-side batch examples only).
 * Reference code for customers calling Tokfai API — not managed operations.
 * Used by scripts/industry-task-demo.mjs and docs/p769-industry-task-templates.md.
 */

export const INDUSTRY_TASK_TEMPLATES = [
  {
    template_id: "ecommerce_product_copy",
    integration_kind: "batch_example",
    use_case:
      "API example: your system sends SKU fields; you call POST /v1/batches/chat to receive listing copy per row.",
    recommended_model: "auto-fast",
    input_schema: {
      type: "object",
      properties: {
        product_name: { type: "string", description: "Product name or SKU label" },
        category: { type: "string", description: "e.g. Home & Kitchen, Electronics" },
        key_features: {
          type: "array",
          items: { type: "string" },
          description: "3–6 feature bullets as source facts",
        },
        tone: {
          type: "string",
          enum: ["professional", "playful", "luxury", "minimal"],
          description: "Copy tone",
        },
        locale: {
          type: "string",
          description: "Output language, e.g. en, zh-CN",
          default: "en",
        },
      },
      required: ["product_name", "category", "key_features"],
    },
    prompt_builder(input) {
      const features = (input.key_features ?? [])
        .map((f, i) => `${i + 1}. ${f}`)
        .join("\n");
      const tone = input.tone ?? "professional";
      const locale = input.locale ?? "en";
      return [
        "You are an ecommerce copywriter. Write listing copy only — no preamble.",
        "",
        `Product: ${input.product_name}`,
        `Category: ${input.category}`,
        `Tone: ${tone}`,
        `Language: ${locale}`,
        "",
        "Key features:",
        features,
        "",
        "Output format:",
        "TITLE: (max 80 chars)",
        "BULLETS: (3–5 lines, each under 120 chars)",
        "DESCRIPTION: (2 short paragraphs, under 400 words total)",
      ].join("\n");
    },
    example_inputs: [
      {
        product_name: "AeroBrew Insulated Travel Mug 16oz",
        category: "Home & Kitchen",
        key_features: [
          "Double-wall vacuum insulation, keeps hot 6h / cold 12h",
          "Leak-proof twist lid with one-hand open",
          "Fits standard car cup holders",
          "BPA-free stainless steel",
        ],
        tone: "professional",
        locale: "en",
      },
      {
        product_name: "CloudWalk Lite Running Shoes",
        category: "Sports & Outdoors",
        key_features: [
          "Breathable mesh upper",
          "Lightweight EVA midsole",
          "Reflective strips for night runs",
          "True-to-size fit",
        ],
        tone: "playful",
        locale: "en",
      },
      {
        product_name: "Nordic Oak Desk Lamp",
        category: "Home & Office",
        key_features: [
          "Solid oak base with matte black arm",
          "Warm 3000K LED, dimmable touch control",
          "USB-C powered, 12W max",
          "Minimal Scandinavian design",
        ],
        tone: "luxury",
        locale: "en",
      },
    ],
  },
  {
    template_id: "customer_service_qa",
    integration_kind: "batch_example",
    use_case:
      "API example: your ticket system sends question + context JSON; Tokfai batch API returns draft reply text per item.",
    recommended_model: "auto-fast",
    input_schema: {
      type: "object",
      properties: {
        customer_question: { type: "string", description: "Raw customer message or ticket body" },
        product_context: {
          type: "string",
          description: "SKU, order status, or product facts the agent can cite",
        },
        policy_notes: {
          type: "string",
          description: "Return window, warranty, shipping rules",
        },
        locale: { type: "string", default: "en" },
      },
      required: ["customer_question", "product_context"],
    },
    prompt_builder(input) {
      const locale = input.locale ?? "en";
      const policy = input.policy_notes ?? "Follow standard company policy.";
      return [
        "You are a helpful customer support agent. Reply in a warm, concise tone.",
        "Do not invent order numbers or refunds not supported by context.",
        "",
        `Customer message:\n${input.customer_question}`,
        "",
        `Product / order context:\n${input.product_context}`,
        "",
        `Policy notes:\n${policy}`,
        "",
        `Language: ${locale}`,
        "",
        "Output: a single reply email (greeting, answer, next steps, sign-off). No internal notes.",
      ].join("\n");
    },
    example_inputs: [
      {
        customer_question:
          "I ordered the travel mug 5 days ago but tracking still says 'label created'. Can you check?",
        product_context:
          "Order #88421, AeroBrew Mug 16oz, shipped via standard (3–5 business days after dispatch).",
        policy_notes: "If no movement in 7 days post-order, offer reship or refund.",
        locale: "en",
      },
      {
        customer_question: "The shoes feel half a size small. Can I exchange for a larger size?",
        product_context: "CloudWalk Lite, size US 9, delivered 3 days ago, unworn per customer.",
        policy_notes: "30-day free size exchange; customer pays return shipping unless defective.",
        locale: "en",
      },
      {
        customer_question: "灯到货后触摸调光不工作，是坏的吗？",
        product_context: "Nordic Oak Desk Lamp, order #90212, delivered yesterday.",
        policy_notes: "7天质量问题免费换货；请先确认USB-C供电≥5V/2A。",
        locale: "zh-CN",
      },
    ],
  },
  {
    template_id: "medical_case_summary",
    integration_kind: "batch_example",
    use_case:
      "API example: your HIS/clinic app sends visit fields; Tokfai batch API returns structured admin summary text (not diagnosis).",
    recommended_model: "auto-pro",
    input_schema: {
      type: "object",
      properties: {
        patient_context: {
          type: "string",
          description: "Age band, relevant history (no full identifiers)",
        },
        chief_complaint: { type: "string" },
        symptoms: {
          type: "array",
          items: { type: "string" },
          description: "Observed or reported symptoms",
        },
        clinician_notes: {
          type: "string",
          description: "Exam findings, vitals summary, pending tests",
        },
        locale: { type: "string", default: "en" },
      },
      required: ["patient_context", "chief_complaint", "symptoms"],
    },
    prompt_builder(input) {
      const symptoms = (input.symptoms ?? []).map((s, i) => `${i + 1}. ${s}`).join("\n");
      const notes = input.clinician_notes ?? "None provided.";
      const locale = input.locale ?? "en";
      return [
        "You assist clinicians with administrative documentation only.",
        "Do NOT diagnose, prescribe, or give patient-facing medical advice.",
        "Flag uncertainty and missing data explicitly.",
        "",
        `Patient context: ${input.patient_context}`,
        `Chief complaint: ${input.chief_complaint}`,
        "",
        "Symptoms / concerns:",
        symptoms,
        "",
        `Clinician notes: ${notes}`,
        "",
        `Language: ${locale}`,
        "",
        "Output sections:",
        "SUMMARY (3–5 sentences)",
        "KEY_FINDINGS (bullet list)",
        "SUGGESTED_FOLLOW_UP (bullet list, admin/referral oriented)",
        "DATA_GAPS (what is missing)",
      ].join("\n");
    },
    example_inputs: [
      {
        patient_context: "Adult, history of seasonal allergies, non-smoker",
        chief_complaint: "Persistent cough for 2 weeks",
        symptoms: ["Dry cough worse at night", "Mild fatigue", "No fever reported"],
        clinician_notes: "Lungs clear, SpO2 98%, chest X-ray pending",
        locale: "en",
      },
      {
        patient_context: "Older adult, hypertension on medication",
        chief_complaint: "Dizziness when standing",
        symptoms: ["Orthostatic lightheadedness", "Occasional palpitations"],
        clinician_notes: "BP 148/92 seated, orthostatic BP drop noted, ECG ordered",
        locale: "en",
      },
    ],
  },
  {
    template_id: "image_assist_prompt",
    integration_kind: "batch_example",
    use_case:
      "API example: your app sends a creative brief JSON; Tokfai batch API returns image-gen prompt text for Image API or downstream tools.",
    recommended_model: "auto-pro",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Main subject or scene" },
        style: {
          type: "string",
          description: "e.g. photorealistic, flat illustration, 3D render",
        },
        mood: { type: "string", description: "e.g. calm, energetic, cinematic" },
        aspect_ratio: {
          type: "string",
          enum: ["1:1", "4:3", "16:9", "9:16"],
          default: "1:1",
        },
        negative_hints: {
          type: "string",
          description: "Things to avoid in the image",
        },
        locale: { type: "string", default: "en" },
      },
      required: ["subject", "style"],
    },
    prompt_builder(input) {
      const mood = input.mood ?? "neutral";
      const ratio = input.aspect_ratio ?? "1:1";
      const negative = input.negative_hints ?? "text, watermark, blurry, distorted anatomy";
      const locale = input.locale ?? "en";
      return [
        "You write prompts for text-to-image models. Output ONE prompt block only.",
        "",
        `Subject: ${input.subject}`,
        `Style: ${input.style}`,
        `Mood: ${mood}`,
        `Aspect ratio: ${ratio}`,
        `Avoid: ${negative}`,
        `Language for any embedded text in scene: ${locale}`,
        "",
        "Format:",
        "PROMPT: (single detailed paragraph, 60–120 words, comma-separated descriptors)",
        "NEGATIVE_PROMPT: (short comma-separated list)",
      ].join("\n");
    },
    example_inputs: [
      {
        subject: "Insulated travel mug on a rainy cafe window table",
        style: "photorealistic product photography",
        mood: "cozy morning",
        aspect_ratio: "4:3",
        negative_hints: "logo, hands, clutter",
      },
      {
        subject: "Running shoes splashing through puddle at dusk",
        style: "cinematic advertising still",
        mood: "energetic",
        aspect_ratio: "16:9",
        negative_hints: "brand logos, crowds",
      },
      {
        subject: "Minimal desk lamp on oak desk, Scandinavian interior",
        style: "3D render",
        mood: "calm",
        aspect_ratio: "1:1",
        negative_hints: "harsh shadows, messy cables",
      },
    ],
  },
];

export function getTemplate(templateId) {
  const id = templateId?.trim();
  return INDUSTRY_TASK_TEMPLATES.find((t) => t.template_id === id) ?? null;
}

export function buildBatchItem(template, input) {
  const content = template.prompt_builder(input);
  return {
    messages: [{ role: "user", content }],
    _meta: {
      template_id: template.template_id,
      input,
    },
  };
}

export function buildBatchRequest(template, inputs) {
  const items = inputs.map((input) => {
    const item = buildBatchItem(template, input);
    return { messages: item.messages };
  });
  return {
    model: template.recommended_model,
    items,
  };
}

export function exampleBatchRequest(template) {
  return buildBatchRequest(template, template.example_inputs);
}
