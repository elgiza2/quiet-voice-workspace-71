import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/ceyo-routines")({ server: { handlers: { POST: async ({ request }) => {
  const secret = process.env.LOVABLE_CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const { runDueRoutines } = await import("@/lib/ceyo/routines.server");
  const { runStaleJobs } = await import("@/lib/ceyo/backgroundJobs.server");
  const { syncPhoneCalls } = await import("@/lib/phone/telnyx.server");
  const [results, jobs, phone] = await Promise.all([runDueRoutines(), runStaleJobs(), syncPhoneCalls().catch(() => [])]);
  return Response.json({ results, jobs, phone });
} } } });