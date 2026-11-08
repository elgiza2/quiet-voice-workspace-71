/**
 * @doc Deployment readiness check.
 *
 * Reports only whether each required server setting is present (true/false),
 * never its value, so an operator can see why a hosted copy is not working.
 */
import { createFileRoute } from "@tanstack/react-router";

export const REQUIRED_SERVER_SETTINGS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LOVABLE_API_KEY",
  "LOVABLE_CRON_SECRET",
  "TELEGRAM_ADMIN_IDS",
] as const;

export function configStatus(env: Record<string, string | undefined>) {
  const settings = Object.fromEntries(
    REQUIRED_SERVER_SETTINGS.map((name) => [name, Boolean(env[name]?.trim())]),
  ) as Record<(typeof REQUIRED_SERVER_SETTINGS)[number], boolean>;
  return { ready: Object.values(settings).every(Boolean), settings };
}

export const Route = createFileRoute("/api/public/config-status")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(configStatus(process.env)), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        }),
    },
  },
});
