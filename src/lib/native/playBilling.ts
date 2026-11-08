import { Capacitor, registerPlugin } from "@capacitor/core";

const billing = registerPlugin<{ purchase(options: { productId: string; accountId: string }): Promise<{ purchaseToken: string }> }>("CeyoPlayBilling");

export function isPlayApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function purchasePlay(productId: string, accountId: string): Promise<string> {
  const result = await billing.purchase({ productId, accountId });
  return result.purchaseToken;
}