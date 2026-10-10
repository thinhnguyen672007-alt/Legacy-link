import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SessionProvider, useSession } from "../session";
import type { Session } from "../api/client";
const sessionFor = (username: string): Session => ({
  base: "http://fixture",
  readToken: username,
  writeToken: username,
  user: {
    id: username,
    username,
    role: "technician",
    disabled: false,
    mustChangePassword: false,
  },
});
function Harness() {
  const { session, sessionError, connect, disconnect } = useSession();
  return (
    <>
      <button onClick={() => connect(sessionFor("old"))}>Old</button>
      <button onClick={() => connect(sessionFor("new"))}>New</button>
      <button onClick={disconnect}>Logout</button>
      <p data-testid="session">{session?.user?.username ?? "signed-out"}</p>
      <p>{sessionError}</p>
    </>
  );
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("does not let a late old-session 401 sign out the new user", async () => {
  vi.useFakeTimers();
  let reply!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          reply = resolve;
        }),
    ),
  );
  render(
    <SessionProvider>
      <Harness />
    </SessionProvider>,
  );
  fireEvent.click(screen.getByText("Old"));
  await act(() => vi.advanceTimersByTimeAsync(30000));
  fireEvent.click(screen.getByText("New"));
  await act(async () => {
    reply(new Response("{}", { status: 401 }));
  });
  expect(screen.getByTestId("session")).toHaveTextContent("new");
});
it("expires a revoked session with an explanation and clears it on fresh login", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
  );
  render(
    <SessionProvider>
      <Harness />
    </SessionProvider>,
  );
  fireEvent.click(screen.getByText("Old"));
  await act(() => vi.advanceTimersByTimeAsync(30000));
  expect(screen.getByTestId("session")).toHaveTextContent("signed-out");
  expect(screen.getByText(/quản trị viên thu hồi/)).toBeInTheDocument();
  fireEvent.click(screen.getByText("New"));
  expect(screen.queryByText(/quản trị viên thu hồi/)).not.toBeInTheDocument();
});
it("keeps a session on temporary backend unavailability", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
  );
  render(
    <SessionProvider>
      <Harness />
    </SessionProvider>,
  );
  fireEvent.click(screen.getByText("Old"));
  await act(() => vi.advanceTimersByTimeAsync(30000));
  expect(screen.getByTestId("session")).toHaveTextContent("old");
});
