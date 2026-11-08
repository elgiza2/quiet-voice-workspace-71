import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { Location } from "react-router-dom";
import PageTransition from "./PageTransition";
import { readPageState, writePageState } from "@/lib/pageStateCache";

const auth = vi.hoisted(() => ({ userId: "owner-a" as string | null }));
vi.mock("@/lib/authStore", () => ({ getAuthState: () => auth }));
const location: Location = { pathname: "/settings", search: "", hash: "", state: null, key: "test" };

describe("page scroll retention", () => {
  beforeEach(() => {
    localStorage.clear();
    auth.userId = "owner-a";
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("restores a saved position when lazy content appears after the wrapper", async () => {
    writePageState("owner-a", "/settings", { scrollTop: 240 });
    const view = render(<PageTransition location={location}><div /></PageTransition>);
    view.rerender(<PageTransition location={location}><div className="ceyo-scroll" data-testid="scroll" /></PageTransition>);
    await waitFor(() => expect(view.getByTestId("scroll").scrollTop).toBe(240));
  });

  it("saves and restores a replacement scroller at the same location", async () => {
    const view = render(<PageTransition location={location}><div key="first" className="ceyo-scroll" data-testid="scroll" /></PageTransition>);
    view.getByTestId("scroll").scrollTop = 360;
    fireEvent.scroll(view.getByTestId("scroll"));
    view.rerender(<PageTransition location={location}><div key="second" className="ceyo-scroll" data-testid="scroll" /></PageTransition>);
    await waitFor(() => expect(view.getByTestId("scroll").scrollTop).toBe(360));
    expect(readPageState("owner-a", "/settings")?.scrollTop).toBe(360);
  });

  it("does not rewrite a previous owner's cache after sign-out", () => {
    const view = render(<PageTransition location={location}><div className="ceyo-scroll" data-testid="scroll" /></PageTransition>);
    view.getByTestId("scroll").scrollTop = 480;
    auth.userId = null;
    view.unmount();
    expect(readPageState("owner-a", "/settings")).toBeNull();
  });
});