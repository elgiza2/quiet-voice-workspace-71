import { describe, expect, it } from "vitest";
import { landingRedirect, surfaceFor } from "./domains";

describe("domain split", () => {
  it("ceyo.si is the landing", () => expect(surfaceFor("ceyo.si")).toBe("landing"));
  it("web.ceyo.si is the web app", () => expect(surfaceFor("web.ceyo.si")).toBe("web"));
  it("app.ceyo.si is the Android app", () => expect(surfaceFor("app.ceyo.si")).toBe("android"));
  it("app paths on ceyo.si move to web.ceyo.si", () => expect(landingRedirect("ceyo.si", "/settings", "?a=1")).toBe("https://web.ceyo.si/settings?a=1"));
  it("legal pages stay on ceyo.si", () => expect(landingRedirect("ceyo.si", "/privacy")).toBeNull());
  it("the web app never redirects", () => expect(landingRedirect("web.ceyo.si", "/settings")).toBeNull());
});
