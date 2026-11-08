import { describe, expect, it } from "vitest";
import { asksToCallMe, finalStatus, normalizeE164, numberMentioned, phoneCallId, requestsPhoneCall, transcriptTurns } from "./phoneRules";

describe("phone call rules", () => {
  it("normalizes local formatting and 00 prefixes to E.164", () => {
    expect(normalizeE164("+20 101 234-5678")).toBe("+201012345678");
    expect(normalizeE164("00201012345678")).toBe("+201012345678");
    expect(normalizeE164("01012345678")).toBeNull();
    expect(normalizeE164("911")).toBeNull();
  });

  it("only dials numbers that appear in the chat, in local or international form", () => {
    expect(numberMentioned("اتصل بالمطعم على 0101 234 5678", "+201012345678")).toBe(true);
    expect(numberMentioned("call +1 (235) 204-7886", "+12352047886")).toBe(true);
    expect(numberMentioned("call the restaurant", "+201012345678")).toBe(false);
  });

  it("requires an explicit, non-negated call request in the latest message", () => {
    expect(requestsPhoneCall("اتصل بالمطعم واحجز ترابيزة")).toBe(true);
    expect(requestsPhoneCall("Please call this number and book a table")).toBe(true);
    expect(requestsPhoneCall("ما تتصلش بحد")).toBe(false);
    expect(requestsPhoneCall("don't call them")).toBe(false);
    expect(requestsPhoneCall("ابحثلي عن مطعم")).toBe(false);
    expect(asksToCallMe("كلمني على موبايلي بعد شوية")).toBe(true);
  });

  it("marks a call without any words from the other side as no answer", () => {
    const turns = transcriptTurns([{ role: "assistant", content: "Hello" }, { role: "system", content: "x" }]);
    expect(finalStatus(turns)).toBe("no_answer");
    expect(finalStatus([...turns, { role: "user", text: "Hi" }])).toBe("completed");
  });

  it("gives the same call id to retries of the same request", async () => {
    const a = await phoneCallId("c", "m", "+12352047886");
    expect(await phoneCallId("c", "m", "+12352047886")).toBe(a);
    expect(await phoneCallId("c", "m2", "+12352047886")).not.toBe(a);
  });
});
