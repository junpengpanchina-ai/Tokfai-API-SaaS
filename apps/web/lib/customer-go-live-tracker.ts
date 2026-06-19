import {
  buildCustomerIntegrationPlan,
  type CustomerIntegrationPlan,
} from "@/lib/customer-integration-plan";
import type { CapacityPlannerInput, PlannerIndustry } from "@/lib/customer-capacity-planner";
import { planCapacity } from "@/lib/customer-capacity-planner";

export type GoLivePhase = "prepare" | "connect" | "validate" | "scale" | "handoff";

export type GoLiveTask = {
  id: string;
  title: string;
  phase: GoLivePhase;
  ownerHint: string;
  expectedOutput: string;
  evidencePlaceholder: string;
  docsAnchor: string;
  copyTarget: string;
  required: boolean;
};

export type GoLiveTrackerPlan = {
  industry: PlannerIndustry;
  summary: string;
  tasks: GoLiveTask[];
  acceptanceReport: string;
  evidencePackMarkdown: string;
};

export const GO_LIVE_TRACKER_STORAGE_KEY = "tokfai_go_live_tracker_state";

export type GoLiveTaskState = {
  status: "pending" | "done";
  evidence: string;
};

export type GoLiveTrackerStorage = {
  industry: PlannerIndustry;
  onlineUsers: number;
  tasks: Record<string, GoLiveTaskState>;
};

function baseTasks(input: CapacityPlannerInput): GoLiveTask[] {
  const capacity = planCapacity(input);
  const tasks: GoLiveTask[] = [
    {
      id: "create-api-key",
      title: "Create API Key",
      phase: "prepare",
      ownerHint: "Backend / platform engineer",
      expectedOutput: "sk-tokfai_* key created in Dashboard",
      evidencePlaceholder: "Key prefix or creation timestamp (never paste full secret in shared docs)",
      docsAnchor: "/dashboard/docs#api-key",
      copyTarget: "Dashboard → API Keys",
      required: true,
    },
    {
      id: "store-key-backend",
      title: "Store API Key on customer backend",
      phase: "prepare",
      ownerHint: "Backend engineer + security review",
      expectedOutput: "Key in server env / secret manager — not in frontend",
      evidencePlaceholder: "Secret manager name or env var name (not the key value)",
      docsAnchor: "/dashboard/docs#integration-plan",
      copyTarget: "Your backend deployment",
      required: true,
    },
    {
      id: "copy-chat-curl",
      title: "Copy one-line Chat curl",
      phase: "prepare",
      ownerHint: "Integration engineer",
      expectedOutput: "curl one-liner ready to paste in Terminal",
      evidencePlaceholder: "Screenshot or note: curl copied from API Keys success card",
      docsAnchor: "/dashboard/docs#chat-api",
      copyTarget: "API Keys → Copy one-line Chat curl",
      required: true,
    },
    {
      id: "no-browser-key",
      title: "Confirm no key exposed in browser frontend",
      phase: "prepare",
      ownerHint: "Security / frontend lead",
      expectedOutput: "No sk-tokfai_* in client bundles or public repos",
      evidencePlaceholder: "Security review sign-off or codebase scan note",
      docsAnchor: "/dashboard/docs#traffic-governor",
      copyTarget: "Frontend codebase review",
      required: true,
    },
    {
      id: "run-chat-request-id",
      title: "Run Chat curl and capture request_id",
      phase: "connect",
      ownerHint: "Integration engineer",
      expectedOutput: "HTTP 200 + request_id in JSON response",
      evidencePlaceholder: "Paste request_id: tokfai_req_...",
      docsAnchor: "/dashboard/docs#chat-api",
      copyTarget: "Terminal curl output",
      required: true,
    },
    {
      id: "connect-sdk-tools",
      title: "Connect SDK / Cursor / Cherry if needed",
      phase: "connect",
      ownerHint: "Developer tooling owner",
      expectedOutput: "Tool configured with base URL + API Key",
      evidencePlaceholder: "Tool name + model alias used (e.g. auto-fast)",
      docsAnchor: "/dashboard/docs#openai-sdk",
      copyTarget: "Cursor / Cherry / SDK config",
      required: false,
    },
    {
      id: "configure-traffic-governor",
      title: "Configure traffic governor",
      phase: "connect",
      ownerHint: "Backend engineer",
      expectedOutput: `Queue + maxConcurrent ~${capacity.chatConcurrencyLabel}`,
      evidencePlaceholder: "Worker file name or concurrency limit configured",
      docsAnchor: "/dashboard/docs#traffic-governor",
      copyTarget: "tokfai-worker.mjs / tokfai_worker.py",
      required: true,
    },
    {
      id: "configure-batch-worker",
      title: "Configure Batch worker for large volume",
      phase: "connect",
      ownerHint: "Backend engineer",
      expectedOutput: capacity.batchFirstRecommended
        ? "Batch create → poll → items flow tested"
        : "Batch worker ready for bulk jobs",
      evidencePlaceholder: "batch_id + sample item request_id",
      docsAnchor: "/dashboard/docs#batch-worker",
      copyTarget: "tokfai-batch-worker.mjs",
      required: capacity.batchFirstRecommended,
    },
  ];

  if (input.hasImages || input.trafficShape === "image" || input.industry === "ecommerce") {
    tasks.push({
      id: "configure-image-low-concurrency",
      title: "Configure Image low concurrency",
      phase: "connect",
      ownerHint: "Backend engineer",
      expectedOutput: `Image maxConcurrent ~${capacity.imageConcurrencyLabel}`,
      evidencePlaceholder: "Image worker concurrency setting + sample request_id",
      docsAnchor: "/dashboard/docs#image-api",
      copyTarget: "tokfai-image-worker.mjs",
      required: input.hasImages || input.trafficShape === "image",
    });
  }

  tasks.push(
    {
      id: "search-usage-request-id",
      title: "Search Usage by request_id",
      phase: "validate",
      ownerHint: "Finance ops / integration engineer",
      expectedOutput: "Usage row matches curl test request_id",
      evidencePlaceholder: "Usage row timestamp + model + credits_charged",
      docsAnchor: "/dashboard/usage",
      copyTarget: "Dashboard → Usage search",
      required: true,
    },
    {
      id: "search-credits-reference",
      title: "Search Credits by reference_id / request_id",
      phase: "validate",
      ownerHint: "Finance ops",
      expectedOutput: "Ledger debit line matches request_id",
      evidencePlaceholder: "Credits reference_id or amount + balance_after",
      docsAnchor: "/dashboard/credits",
      copyTarget: "Dashboard → Credits ledger",
      required: true,
    },
    {
      id: "confirm-success-charged",
      title: "Confirm success requests are charged",
      phase: "validate",
      ownerHint: "Finance ops",
      expectedOutput: "HTTP 200 calls show credits_charged in Usage",
      evidencePlaceholder: "request_id + credits_charged amount",
      docsAnchor: "/dashboard/docs#usage-credits",
      copyTarget: "Usage row evidence",
      required: true,
    },
    {
      id: "confirm-failed-not-charged",
      title: "Confirm failed requests are normally not charged",
      phase: "validate",
      ownerHint: "Integration engineer",
      expectedOutput: "401 / validation errors — no matching debit",
      evidencePlaceholder: "Failed test request_id + no Usage row note",
      docsAnchor: "/dashboard/docs#error-codes",
      copyTarget: "Negative test log",
      required: true,
    },
    {
      id: "confirm-error-handling",
      title: "Confirm 401 / 429 / 503 / 504 handling",
      phase: "validate",
      ownerHint: "Backend on-call owner",
      expectedOutput: "Backoff + concurrency reduction — no infinite retry",
      evidencePlaceholder: "Error code tested + client action taken",
      docsAnchor: "/dashboard/docs#retry-and-backoff",
      copyTarget: "Retry policy config",
      required: true,
    },
    {
      id: "set-client-concurrency",
      title: "Set client-side concurrency limits",
      phase: "scale",
      ownerHint: "Backend engineer",
      expectedOutput: `Chat ${capacity.chatConcurrencyLabel}, Image ${capacity.imageConcurrencyLabel}`,
      evidencePlaceholder: "maxConcurrent / max_workers values deployed",
      docsAnchor: "/dashboard/docs#client-side-concurrency",
      copyTarget: "Traffic governor config",
      required: true,
    },
    {
      id: "batch-first-large-volume",
      title: "Use Batch-first for large-volume jobs",
      phase: "scale",
      ownerHint: "Product / ops owner",
      expectedOutput: capacity.batchFirstRecommended
        ? "Bulk jobs routed to Batch — not sync Chat flood"
        : "Batch path documented for future bulk",
      evidencePlaceholder: "Job type → Batch vs Chat decision note",
      docsAnchor: "/dashboard/docs#large-volume-batch-queue",
      copyTarget: "Integration plan",
      required: capacity.batchFirstRecommended,
    },
    {
      id: "enable-retry-backoff",
      title: "Enable retry/backoff policy",
      phase: "scale",
      ownerHint: "Backend engineer",
      expectedOutput: `Max ${capacity.retryMaxAttempts} attempts, 5s / 15s / 30s backoff`,
      evidencePlaceholder: "Retry config snippet or worker version",
      docsAnchor: "/dashboard/docs#retry-and-backoff",
      copyTarget: "Safe retry client template",
      required: true,
    },
    {
      id: "assign-monitoring-owner",
      title: "Assign monitoring owner",
      phase: "scale",
      ownerHint: "Engineering manager",
      expectedOutput: "Named owner for request_id logging + Usage/Credits alerts",
      evidencePlaceholder: "Owner name / team + escalation channel",
      docsAnchor: "/dashboard/docs#usage-credits",
      copyTarget: "On-call contact",
      required: true,
    },
    {
      id: "copy-integration-plan",
      title: "Copy integration plan",
      phase: "handoff",
      ownerHint: "Tech lead",
      expectedOutput: "Plain text or Markdown plan shared with team",
      evidencePlaceholder: "Link or date plan shared with stakeholders",
      docsAnchor: "/dashboard/docs#integration-plan",
      copyTarget: "Handoff pack",
      required: true,
    },
    {
      id: "copy-go-live-acceptance",
      title: "Copy go-live acceptance items",
      phase: "handoff",
      ownerHint: "Project manager",
      expectedOutput: "13 acceptance items distributed to owners",
      evidencePlaceholder: "Sign-off tracker or ticket IDs",
      docsAnchor: "/dashboard/docs#integration-plan",
      copyTarget: "Go-live acceptance copy",
      required: true,
    },
    {
      id: "copy-final-acceptance-report",
      title: "Copy final acceptance report",
      phase: "handoff",
      ownerHint: "Tech lead + finance ops",
      expectedOutput: "Report with request_id evidence placeholders filled",
      evidencePlaceholder: "Report version / date shared",
      docsAnchor: "/dashboard/docs#go-live-tracker",
      copyTarget: "Final acceptance report",
      required: true,
    },
    {
      id: "revoke-exposed-key",
      title: "Revoke old test key if exposed",
      phase: "handoff",
      ownerHint: "Security + backend engineer",
      expectedOutput: "Test keys revoked; production key rotated if needed",
      evidencePlaceholder: "Revoked key id + rotation date",
      docsAnchor: "/dashboard/api-keys",
      copyTarget: "API Keys revoke action",
      required: false,
    }
  );

  return tasks;
}

function industryTasks(industry: PlannerIndustry): GoLiveTask[] {
  switch (industry) {
    case "hospital":
      return [
        {
          id: "hospital-medical-boundary",
          title: "Verify medical boundary — assist only, no diagnosis",
          phase: "validate",
          ownerHint: "Clinical compliance / medical director",
          expectedOutput: "Workflow documented — no auto diagnosis or treatment",
          evidencePlaceholder: "Compliance sign-off or policy reference",
          docsAnchor: "/dashboard/docs#industry-examples",
          copyTarget: "Hospital boundary review",
          required: true,
        },
        {
          id: "hospital-doctor-review",
          title: "Assign doctor / manual review owner",
          phase: "handoff",
          ownerHint: "Clinical operations lead",
          expectedOutput: "Clinician reviews all AI output before EMR entry",
          evidencePlaceholder: "Reviewer role + escalation path",
          docsAnchor: "/dashboard/docs#industry-examples",
          copyTarget: "Clinical workflow owner",
          required: true,
        },
      ];
    case "auto":
      return [
        {
          id: "auto-enterprise-reviewer",
          title: "Assign enterprise reviewer / service advisor confirmation",
          phase: "handoff",
          ownerHint: "After-sales operations manager",
          expectedOutput: "Service advisor confirms repair decisions before customer reply",
          evidencePlaceholder: "Reviewer team + CRM workflow step",
          docsAnchor: "/dashboard/docs#industry-examples",
          copyTarget: "Service desk owner",
          required: true,
        },
      ];
    case "ecommerce":
      return [
        {
          id: "ecommerce-publish-review",
          title: "Assign publish review owner",
          phase: "handoff",
          ownerHint: "Merchandising / content lead",
          expectedOutput: "SKU copy and images reviewed before marketplace publish",
          evidencePlaceholder: "Review queue owner + listing publish steps",
          docsAnchor: "/dashboard/docs#industry-examples",
          copyTarget: "Listing publish owner",
          required: true,
        },
      ];
    case "support":
      return [
        {
          id: "support-crm-owner",
          title: "Assign CRM / ticket owner",
          phase: "handoff",
          ownerHint: "Support operations lead",
          expectedOutput: "Agents review drafts; CRM owns ticket status",
          evidencePlaceholder: "CRM system + agent review step",
          docsAnchor: "/dashboard/docs#industry-examples",
          copyTarget: "Helpdesk platform owner",
          required: true,
        },
      ];
    default:
      return [];
  }
}

function buildEvidencePackMarkdown(
  input: CapacityPlannerInput,
  plan: CustomerIntegrationPlan,
  tasks: GoLiveTask[]
): string {
  const lines = [
    "# Tokfai go-live evidence pack",
    "",
    `Industry: ${input.industry} | Online users: ${input.onlineUsers} | Workload: ${input.trafficShape}`,
    "",
    "## Evidence log",
    "",
    ...tasks.map((task) => [
      `### ${task.title}`,
      `- Phase: ${task.phase}`,
      `- Owner: ${task.ownerHint}`,
      `- Expected: ${task.expectedOutput}`,
      `- Evidence: _${task.evidencePlaceholder}_`,
      `- Docs: ${task.docsAnchor}`,
      "",
    ].join("\n")),
    "## Reconciliation",
    ...plan.reconciliationSteps.map((s) => `- ${s}`),
  ];
  return lines.join("\n");
}

function buildAcceptanceReportTemplate(
  input: CapacityPlannerInput,
  plan: CustomerIntegrationPlan
): string {
  const batchFirst = planCapacity(input).batchFirstRecommended;
  return [
    "Tokfai final acceptance report (fill evidence before sign-off)",
    "",
    "Project summary:",
    plan.summary,
    "",
    "Endpoints tested:",
    ...plan.endpointSplit.map((r) => `- ${r.endpoint} — ${r.workload}`),
    "",
    "Model plan:",
    ...plan.modelPlan.map((m) => `- ${m.scenario}: ${m.model}`),
    "",
    "Concurrency plan:",
    `- Chat: ${plan.concurrencyPlan.chatConcurrency}`,
    `- Image: ${plan.concurrencyPlan.imageConcurrency}`,
    `- Batch: ${plan.concurrencyPlan.batchItemsPerJob} items/job, poll ${plan.concurrencyPlan.batchPollIntervalSeconds}s`,
    "",
    "request_id evidence:",
    "[ paste primary test request_id ]",
    "",
    "Usage / Credits reconciliation:",
    "[ Usage row URL or screenshot note ]",
    "[ Credits reference_id / amount ]",
    "",
    "Retry/backoff policy:",
    ...plan.retryPlan.map((r) => `- ${r.error}: ${r.action}`),
    "",
    "Batch policy:",
    batchFirst ? "Batch-first for large volume jobs." : "Batch optional for bulk off-peak.",
    "",
    "Security confirmation:",
    ...plan.securityNotes.map((n) => `- ${n}`),
    "",
    "Final owner:",
    "[ Name / team responsible for production monitoring ]",
    "",
    plan.boundaryNote ? `Boundary: ${plan.boundaryNote}` : "",
  ].join("\n");
}

export function buildGoLiveTrackerPlan(input: CapacityPlannerInput): GoLiveTrackerPlan {
  const integrationPlan = buildCustomerIntegrationPlan(input);
  const tasks = [...baseTasks(input), ...industryTasks(input.industry)];

  return {
    industry: input.industry,
    summary: `Go-live tracker for ${integrationPlan.title} (~${input.onlineUsers} online users).`,
    tasks,
    acceptanceReport: buildAcceptanceReportTemplate(input, integrationPlan),
    evidencePackMarkdown: buildEvidencePackMarkdown(input, integrationPlan, tasks),
  };
}

export const GO_LIVE_PHASES: GoLivePhase[] = ["prepare", "connect", "validate", "scale", "handoff"];

export function tasksByPhase(tasks: GoLiveTask[]): Record<GoLivePhase, GoLiveTask[]> {
  const grouped: Record<GoLivePhase, GoLiveTask[]> = {
    prepare: [],
    connect: [],
    validate: [],
    scale: [],
    handoff: [],
  };
  for (const task of tasks) {
    grouped[task.phase].push(task);
  }
  return grouped;
}
