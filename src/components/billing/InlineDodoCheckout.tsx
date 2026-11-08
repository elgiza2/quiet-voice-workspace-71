import { useEffect, useId, useState } from "react";

/** Browser-only SDK; payment events never grant a subscription. */
export function InlineDodoCheckout({ url }: { url: string }) {
  const id = `dodo-${useId().replace(/:/g, "")}`;
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let close: (() => void) | undefined;
    void import("dodopayments-checkout").then(({ DodoPayments }) => {
      if (disposed) return;
      const host = new URL(url).hostname;
      if (host !== "checkout.dodopayments.com" && host !== "test.checkout.dodopayments.com") throw new Error("Invalid checkout address");
      DodoPayments.Initialize({
        mode: host.startsWith("test.") ? "test" : "live",
        displayType: "inline",
        onEvent: (event) => {
          if (!disposed && (event.event_type === "checkout.error" || event.event_type === "checkout.link_expired")) setError("Payment could not load. Go back and try again.");
        },
      });
      DodoPayments.Checkout.open({ checkoutUrl: url, elementId: id, options: { manualRedirect: true, showSecurityBadge: true } });
      close = () => DodoPayments.Checkout.close();
    }).catch(() => { if (!disposed) setError("Payment could not load. Go back and try again."); });
    return () => { disposed = true; close?.(); };
  }, [url, id]);
  return <>{error && <p className="cbox-error" role="alert">{error}</p>}<div id={id} className="cbox-embedded" aria-label="Secure international payment" /></>;
}