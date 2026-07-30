import { describe, expect, it } from "vitest";
import { loadChatChecks, saveChatChecks } from "./chat-checks";

describe("chat checklist persistence", () => {
  it("round-trips check state per message", () => {
    saveChatChecks("msgA", { "msgA-0": true, "msgA-2": true });
    expect(loadChatChecks("msgA")).toEqual({ "msgA-0": true, "msgA-2": true });
    expect(loadChatChecks("msgB")).toEqual({});
    saveChatChecks("msgA", {});
    expect(loadChatChecks("msgA")).toEqual({});
  });

  it("survives corrupt storage gracefully", () => {
    localStorage.setItem("sensei.chat.checks.msgC", "{broken");
    expect(loadChatChecks("msgC")).toEqual({});
    localStorage.removeItem("sensei.chat.checks.msgC");
  });
});
