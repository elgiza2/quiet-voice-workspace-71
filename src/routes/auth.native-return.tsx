import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth/native-return")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Return to Ceyo — Google Sign-in" },
    { name: "description", content: "Complete Google sign-in and return securely to the Ceyo Android app." },
    { property: "og:title", content: "Return to Ceyo — Google Sign-in" },
    { property: "og:description", content: "Complete Google sign-in and return securely to Ceyo." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "referrer", content: "no-referrer" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: NativeReturn,
});

function NativeReturn() {
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    window.history.replaceState({}, "", "/auth/native-return");
    if (!code || code.length > 2048) return;
    const destination = `ceyo://auth/callback?${new URLSearchParams({ code })}`;
    setTarget(destination);
    window.location.assign(destination);
  }, []);
  return <main className="min-h-dvh flex flex-col items-center justify-center gap-6 bg-background text-foreground px-6">
    <h1 className="text-3xl font-semibold">Ceyo</h1>
    {target ? <Button onClick={() => { window.location.assign(target); }}>العودة إلى التطبيق</Button>
      : <p role="alert">تعذّر إكمال تسجيل الدخول. جرّب مرة أخرى من التطبيق.</p>}
  </main>;
}