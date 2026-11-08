import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CheckoutBox } from "./CheckoutBox";
it("selecting a payment method starts details without a second Subscribe", () => {
  const onPay = vi.fn();
  render(<CheckoutBox name="Ceyo Plus" subtitle="Monthly" total="EGP 1079" kashier busy={false} error="" onPay={onPay} />);
  fireEvent.click(screen.getByRole("button", { name: /^Card/ }));
  expect(onPay).toHaveBeenCalledTimes(1);
  expect(onPay).toHaveBeenCalledWith("card");
});
it("cannot select a method before the country quote arrives", () => {
  const onPay = vi.fn();
  render(<CheckoutBox name="Ceyo Plus" subtitle="Monthly" total="…" kashier={null} busy={false} error="" onPay={onPay} />);
  fireEvent.click(screen.getByRole("button", { name: /^Card/ }));
  expect(onPay).not.toHaveBeenCalled();
});