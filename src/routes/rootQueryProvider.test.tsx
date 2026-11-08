import { render, screen } from "@testing-library/react";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { vi, it, expect } from "vitest";

const context = vi.hoisted(() => ({ client: null as QueryClient | null }));
vi.mock("@tanstack/react-router", () => ({
  createRootRouteWithContext: () => () => ({ useRouteContext: () => ({ queryClient: context.client }) }),
  Outlet: () => <PriceProbe />,
  useRouter: vi.fn(), HeadContent: () => null, Scripts: () => null, Link: () => null,
}));
function PriceProbe() {
  const price = useQuery({ queryKey: ["regression-price"], queryFn: async () => 1000 });
  return <span>{price.data ?? "Loading"}</span>;
}
import { RootComponent } from "./__root";

it("provides the existing router client to page queries without an extra wrapper", async () => {
  context.client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<RootComponent />);
  expect(await screen.findByText("1000")).toBeInTheDocument();
  expect(context.client.getQueryData(["regression-price"])).toBe(1000);
  context.client.clear();
});