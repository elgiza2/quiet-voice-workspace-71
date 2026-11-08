/** Browser-only request assembly; never persist or log card details. */
type Order = { orderId: string; merchantId: string; amount: number; currency: string; redirect: string; webhookUrl: string };
type Card = { number: string; name: string; exp: string; cvv: string };

export function kashierCardPayload(order: Order, card: Card, customerReference: string, description: string) {
  if (!customerReference) throw new Error("Please sign in first");
  const [month, year] = card.exp.split("/");
  return {
    apiOperation: "PAY", merchantId: order.merchantId, interactionSource: "ECOMMERCE",
    // Mandatory for the current Kashier 3DS iframe flow (Direct API card-form docs).
    newPaymentUI: true,
    customer: { reference: customerReference },
    paymentMethod: { type: "CARD", card: { number: card.number, nameOnCard: card.name.trim(), expiry: { month, year }, securityCode: card.cvv, enable3DS: true } },
    order: { reference: order.orderId, amount: String(order.amount), currency: order.currency, description },
    merchantRedirect: order.redirect, serverWebhook: order.webhookUrl,
    reconciliation: { webhookUrl: order.webhookUrl, merchantRedirect: order.redirect, redirect: false },
  };
}