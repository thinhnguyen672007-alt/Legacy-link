import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";
import { SessionProvider, useSession } from "../session";
function Controls() {
  const { connect, disconnect, expire } = useSession();
  return (
    <>
      <button
        onClick={() =>
          connect({
            base: "http://fixture",
            readToken: "motion-token",
            writeToken: "",
            user: {
              id: "1",
              username: "viewer",
              role: "viewer",
              disabled: false,
              mustChangePassword: false,
            },
          })
        }
      >
        Connect test
      </button>
      <button onClick={disconnect}>Disconnect test</button>
      <button onClick={() => expire("motion-token")}>Expire test</button>
    </>
  );
}
afterEach(() => vi.unstubAllGlobals());
it.each(["Disconnect test", "Expire test"])(
  "keeps the same backdrop and SVG through %s and relogin",
  async (exit) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
    );
    const r = render(
      <MemoryRouter>
        <SessionProvider>
          <Controls />
          <App />
        </SessionProvider>
      </MemoryRouter>,
    );
    const surface = r.container.querySelector(".ll-morph-surface");
    const svg = surface?.querySelector("svg");
    fireEvent.click(screen.getByText("Connect test"));
    expect(r.container.querySelector(".ll-morph-surface")).toBe(surface);
    expect(surface).toHaveClass("collapsed");
    fireEvent.click(screen.getByText(exit));
    await act(async () => {});
    expect(r.container.querySelector(".ll-morph-surface")).toBe(surface);
    expect(surface?.querySelector("svg")).toBe(svg);
    expect(surface).not.toHaveClass("collapsed");
    expect(r.container.querySelector(".dashboard-page-outgoing")).toBeNull();
    fireEvent.click(screen.getByText("Connect test"));
    expect(r.container.querySelector(".ll-morph-surface")).toBe(surface);
  },
);
