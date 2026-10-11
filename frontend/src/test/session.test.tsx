import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SessionProvider, useSession } from "../session";
import type { Session } from "../api/client";
import { SESSION_STORAGE_KEY } from "../session-storage";
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
      <p data-testid="write">{session?.writeToken || "read-only"}</p>
      <p>{sessionError}</p>
    </>
  );
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("restores login after remount and obtains current permissions from the server", async () => {
  const user = { ...sessionFor("old").user!, role: "viewer" };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(user))),
      ),
  );
  const first = render(
    <SessionProvider>
      <Harness />
    </SessionProvider>,
  );
  fireEvent.click(screen.getByText("Old"));
  expect(JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!)).toEqual({
    base: "http://fixture",
    token: "old",
  });
  first.unmount();
  render(
    <SessionProvider>
      <Harness />
    </SessionProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Đang kiểm tra");
  expect(screen.queryByTestId("session")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByTestId("session")).toHaveTextContent("old"),
  );
  expect(screen.getByTestId("write")).toHaveTextContent("read-only");
});
it("removes saved credentials when restoring an expired or revoked session", async () => {
  sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ base: "http://fixture", token: "expired" }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
  );
  render(
    <SessionProvider>
      <Harness />
    </SessionProvider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId("session")).toHaveTextContent("signed-out"),
  );
  expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  expect(screen.getByText(/quản trị viên thu hồi/)).toBeInTheDocument();
});
it("logout clears saved login so refresh cannot sign the user back in", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response('{"ok":true}')),
  );
  const first = render(
    <SessionProvider>
      <Harness />
    </SessionProvider>,
  );
  fireEvent.click(screen.getByText("Old"));
  fireEvent.click(screen.getByText("Logout"));
  expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  first.unmount();
  render(
    <SessionProvider>
      <Harness />
    </SessionProvider>,
  );
  expect(screen.getByTestId("session")).toHaveTextContent("signed-out");
});
it("waits for server validation during an outage and restores after recovery", async () => {
  vi.useFakeTimers();
  sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ base: "http://fixture", token: "old" }),
  );
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(sessionFor("old").user)),
      ),
  );
  render(
    <SessionProvider>
      <Harness />
    </SessionProvider>,
  );
  await act(async () => {});
  expect(screen.getByRole("status")).toHaveTextContent("Đang thử kết nối lại");
  expect(screen.queryByTestId("session")).not.toBeInTheDocument();
  expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(screen.getByTestId("session")).toHaveTextContent("old");
});
it("ignores a pending restore after the user chooses to sign in again", async () => {
  sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ base: "http://fixture", token: "old" }),
  );
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
  fireEvent.click(screen.getByText("Đăng nhập lại"));
  fireEvent.click(screen.getByText("New"));
  await act(async () => {
    reply(new Response(JSON.stringify(sessionFor("old").user)));
  });
  expect(screen.getByTestId("session")).toHaveTextContent("new");
  expect(JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!).token).toBe(
    "new",
  );
});
it("ignores malformed saved data and still permits login when storage is blocked", () => {
  sessionStorage.setItem(SESSION_STORAGE_KEY, "not json");
  render(
    <SessionProvider>
      <Harness />
    </SessionProvider>,
  );
  expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  fireEvent.click(screen.getByText("Old"));
  expect(screen.getByTestId("session")).toHaveTextContent("old");
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
