// The demo reset's refusal rules, kept apart from the script so they can be tested on their own.
// Returns why the reset must not run, or null when every condition holds.
export interface ResetCheck {
  allowedEnv: string | undefined;
  argv: readonly string[];
  // Read from the database — only asked for once the first two pass.
  orderCount: number;
  isDemo: boolean;
}

export function preflightRefusal(input: Pick<ResetCheck, "allowedEnv" | "argv">): string | null {
  if (input.allowedEnv !== "true") {
    return "set DEMO_RESET_ALLOWED=true to allow a demo reset on this machine.";
  }
  if (!input.argv.includes("--yes")) {
    return "this deletes all data. Run again with --yes: npm run demo:reset -- --yes";
  }
  return null;
}

export function databaseRefusal(input: Pick<ResetCheck, "orderCount" | "isDemo">): string | null {
  if (input.orderCount > 0 && !input.isDemo) {
    return `this database has ${input.orderCount} order(s) and is not a demo database (SiteSettings.isDemo is not true).`;
  }
  return null;
}
