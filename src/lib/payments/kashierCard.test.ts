import { describe, it, expect } from "vitest";
import { kashierCardPayload } from "./kashierCard";

const order = { orderId: "test-order", merchantId: "MID-test", amount: 1079, currency: "EGP", redirect: "https://example.com/settings/plans", webhookUrl: "https://example.com/api/public/kashier-webhook" };
const card = { number: "TEST-PAN", name: "Test User", exp: "01/30", cvv: "TEST-CVV" };
describe("Kashier Direct API card contract", () => {
  it("enables the mandatory new payment UI for 3DS", () => expect(kashierCardPayload(order, card, "test-user", "Ceyo").newPaymentUI).toBe(true));
  it("supplies the required customer reference", () => expect(kashierCardPayload(order, card, "test-user", "Ceyo").customer.reference).toBe("test-user"));
  it("keeps bank authentication enabled inside card", () => expect(kashierCardPayload(order, card, "test-user", "Ceyo").paymentMethod.card.enable3DS).toBe(true));
  it("keeps checkout inline and uses the server order amount", () => {
    const payload = kashierCardPayload(order, card, "test-user", "Ceyo");
    expect(payload.reconciliation.redirect).toBe(false);
    expect(payload.order.amount).toBe("1079");
  });
  it("rejects a missing signed-in reference", () => expect(() => kashierCardPayload(order, card, "", "Ceyo")).toThrow("Please sign in first"));
});