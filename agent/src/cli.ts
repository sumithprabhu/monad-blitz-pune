import type { Address } from "viem";
import { runTask } from "./agent.js";
import { runDemo } from "./demo.js";

function parseAllowedRecipients(): Record<string, Address> {
  const raw = process.env.ALLOWED_RECIPIENTS;
  if (!raw) {
    throw new Error(
      'Set ALLOWED_RECIPIENTS to a JSON map of label -> address, e.g. \'{"cloud-provider":"0x..."}\''
    );
  }
  return JSON.parse(raw) as Record<string, Address>;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "demo") {
    await runDemo();
    return;
  }

  if (command === "spend") {
    const goal = rest.join(" ") || process.env.GOAL;
    if (!goal) throw new Error('Usage: npm run spend -- "<goal for the agent to spend towards>"');
    const result = await runTask({ goal, allowedRecipients: parseAllowedRecipients() });
    console.log(`\nfinal status: ${result.finalStatus}`);
    return;
  }

  console.error("Usage:\n  npm run demo\n  npm run spend -- \"<goal>\"");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
