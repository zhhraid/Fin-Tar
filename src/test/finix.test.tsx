import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FinixChat } from "@/components/FinixChat";

vi.mock("@/lib/env", () => ({ cloudEnabled: false, supabaseUrl: "", supabaseAnonKey: "" }));

describe("layar Finix", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("tidak crash di browser yang scrollIntoView-nya mengembalikan Promise", () => {
    // Newer Chrome returns a Promise here; React must never receive it as an effect cleanup.
    const scroll = vi.fn(() => Promise.resolve());
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scroll });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ provider: "demo" })));
    window.localStorage.setItem("fintar-agent-runs-v1", JSON.stringify([{ id: "r1", question: "Is my cash safe?", answer: "Yes.", plan: [], steps: [], metrics: [], proposals: [] }]));

    const { rerender, unmount } = render(<FinixChat prompt={null} />);
    rerender(<FinixChat prompt={null} />);
    expect(() => unmount()).not.toThrow();
    expect(scroll).toHaveBeenCalled();
  });
});
