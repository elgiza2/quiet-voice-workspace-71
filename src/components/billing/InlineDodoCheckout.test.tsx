import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineDodoCheckout } from "./InlineDodoCheckout";
const sdk = vi.hoisted(() => ({ Initialize: vi.fn(), Checkout: { open: vi.fn(), close: vi.fn() } }));
vi.mock("dodopayments-checkout", () => ({ DodoPayments: sdk }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("international checkout containment", () => {
  it("embeds the session with automatic redirects disabled", async () => {
    const view = render(<InlineDodoCheckout url="https://checkout.dodopayments.com/session/example" />);
    await waitFor(() => expect(sdk.Checkout.open).toHaveBeenCalled());
    expect(sdk.Initialize).toHaveBeenCalledWith(expect.objectContaining({ displayType: "inline", mode: "live" }));
    expect(sdk.Checkout.open).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ manualRedirect: true }) }));
    view.unmount();
    expect(sdk.Checkout.close).toHaveBeenCalledOnce();
  });
  it("does not embed an untrusted checkout URL", async () => {
    render(<InlineDodoCheckout url="https://example.com/session" />);
    await waitFor(() => expect(document.querySelector('[role="alert"]')).not.toBeNull());
    expect(sdk.Checkout.open).not.toHaveBeenCalled();
    expect(sdk.Initialize).not.toHaveBeenCalled();
  });
});