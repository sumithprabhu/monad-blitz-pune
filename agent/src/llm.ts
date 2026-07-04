import Anthropic from "@anthropic-ai/sdk";
import { isAddress, parseUnits, type Address } from "viem";
import { config } from "./config.js";

export interface SpendDecision {
  to: Address;
  amount: bigint; // smallest units (mUSDC has 6 decimals)
  memo: string;
  reasoning: string;
}

export interface DecideSpendParams {
  goal: string;
  /** address => human label, e.g. "cloud-provider-invoicing" */
  allowedRecipients: Record<string, string>;
  perTxCapUsdc: string;
  dailyCapUsdc: string;
  spentTodayUsdc: string;
}

const PROPOSE_SPEND_TOOL: Anthropic.Tool = {
  name: "propose_spend",
  description: "Propose a single on-chain spend for the vault to authorize.",
  input_schema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient address, must be one of the allowed recipients given in the prompt" },
      amount_usdc: { type: "string", description: "Amount in mUSDC as a decimal string, e.g. \"12.50\"" },
      memo: { type: "string", description: "Short human-readable reason for this spend (required by the vault, shown on the dashboard)" },
      reasoning: { type: "string", description: "One sentence on why this spend serves the stated goal" },
    },
    required: ["to", "amount_usdc", "memo", "reasoning"],
  },
};

let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

/**
 * Asks Claude to decide the next spend for a stated goal, constrained to the
 * agent's whitelisted recipients. Falls back to a deterministic heuristic
 * (no network call) when ANTHROPIC_API_KEY is unset, so demos still run offline.
 */
export async function decideSpend(params: DecideSpendParams): Promise<SpendDecision> {
  if (!config.anthropicApiKey) {
    return heuristicDecision(params);
  }

  const recipientList = Object.entries(params.allowedRecipients)
    .map(([addr, label]) => `- ${addr} (${label})`)
    .join("\n");

  const message = await getClient().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system:
      "You are the decision function inside an autonomous spending agent. You never hold funds yourself " +
      "- you only recommend a single spend, which an on-chain vault contract will independently authorize " +
      "against its own policy (spend caps, recipient whitelist, approval thresholds). Always call propose_spend " +
      "exactly once. Only propose recipients from the allowed list you're given.",
    tools: [PROPOSE_SPEND_TOOL],
    tool_choice: { type: "tool", name: "propose_spend" },
    messages: [
      {
        role: "user",
        content:
          `Goal: ${params.goal}\n\n` +
          `Allowed recipients:\n${recipientList}\n\n` +
          `Policy context: per-tx cap ${params.perTxCapUsdc} mUSDC, daily cap ${params.dailyCapUsdc} mUSDC, ` +
          `already spent today ${params.spentTodayUsdc} mUSDC.\n\n` +
          `Propose one spend that makes progress on the goal while respecting the caps.`,
      },
    ],
  });

  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "propose_spend"
  );
  if (!toolUse) throw new Error("Claude did not return a propose_spend tool call");

  const input = toolUse.input as { to: string; amount_usdc: string; memo: string; reasoning: string };
  if (!isAddress(input.to)) throw new Error(`Claude proposed a non-address recipient: ${input.to}`);

  return {
    to: input.to,
    amount: parseUnits(input.amount_usdc, 6),
    memo: input.memo,
    reasoning: input.reasoning,
  };
}

function heuristicDecision(params: DecideSpendParams): SpendDecision {
  const [firstAddr, firstLabel] = Object.entries(params.allowedRecipients)[0] ?? [];
  if (!firstAddr) throw new Error("No allowed recipients configured for heuristic decision");

  const perTxCap = Number(params.perTxCapUsdc);
  const amount = Math.max(1, Math.min(perTxCap * 0.2, 10)).toFixed(2);

  return {
    to: firstAddr as Address,
    amount: parseUnits(amount, 6),
    memo: `heuristic: ${params.goal}`.slice(0, 80),
    reasoning: `No ANTHROPIC_API_KEY set - deterministic fallback picked ${firstLabel ?? firstAddr} for a small in-policy spend.`,
  };
}
