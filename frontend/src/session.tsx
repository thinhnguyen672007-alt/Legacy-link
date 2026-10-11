import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError, createApi, type Session } from "./api/client";
import { accountsApi } from "./api/accounts";
import { forgetSession, readSession, rememberSession } from "./session-storage";
const Context = createContext<{
  session: Session | null;
  sessionError: string;
  connect: (s: Session) => void;
  disconnect: () => void;
  expire: (token: string) => void;
} | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const currentSession = useRef<Session | null>(null);
  const [restoring, setRestoring] = useState(readSession);
  const [restoreError, setRestoreError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );
  const expire = useCallback(
    (token: string) => {
      if (!currentSession.current || currentSession.current.readToken !== token)
        return;
      void client.cancelQueries();
      client.clear();
      forgetSession();
      currentSession.current = null;
      setSessionError(
        "Phiên đăng nhập đã hết hạn hoặc bị quản trị viên thu hồi. Hãy đăng nhập lại.",
      );
      setSession(null);
    },
    [client],
  );
  useEffect(() => {
    if (!restoring) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const candidate: Session = {
      base: restoring.base,
      readToken: restoring.token,
      writeToken: "",
    };
    async function restore() {
      try {
        const user = await accountsApi(candidate).me(controller.signal);
        if (cancelled) return;
        const restored = {
          ...candidate,
          user,
          writeToken: user.role === "viewer" ? "" : candidate.readToken,
        };
        currentSession.current = restored;
        setSession(restored);
        setRestoring(null);
        setRestoreError("");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          forgetSession();
          setRestoring(null);
          setSessionError(
            "Phiên đăng nhập đã hết hạn hoặc bị quản trị viên thu hồi. Hãy đăng nhập lại.",
          );
        } else {
          setRestoreError(
            "Chưa kiểm tra được phiên đăng nhập. Đang thử kết nối lại…",
          );
          retry = setTimeout(() => void restore(), 5000);
        }
      }
    }
    void restore();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(retry);
    };
  }, [restoring]);
  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void accountsApi(session)
        .me(controller.signal)
        .catch((error) => {
          if (!cancelled && error instanceof ApiError && error.status === 401) {
            expire(session.readToken);
          }
        });
    }, 30000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [session, expire]);
  const clear = () => {
    void client.cancelQueries();
    client.clear();
  };
  return (
    <Context.Provider
      value={{
        session,
        sessionError,
        expire,
        connect: (s) => {
          clear();
          setSessionError("");
          rememberSession(s);
          currentSession.current = s;
          setSession(s);
        },
        disconnect: () => {
          if (session?.user)
            void accountsApi(session)
              .logout()
              .catch(() => {});
          clear();
          forgetSession();
          currentSession.current = null;
          setRestoring(null);
          setSessionError("");
          setSession(null);
        },
      }}
    >
      <QueryClientProvider client={client}>
        {restoring ? (
          <div className="connection">
            <div className="connection-form">
              <p role="status">
                {restoreError || "Đang kiểm tra phiên đăng nhập…"}
              </p>
              <button
                onClick={() => {
                  forgetSession();
                  setRestoring(null);
                  setRestoreError("");
                }}
              >
                Đăng nhập lại
              </button>
            </div>
          </div>
        ) : (
          children
        )}
      </QueryClientProvider>
    </Context.Provider>
  );
}
export function useSession() {
  const c = useContext(Context);
  if (!c) throw new Error("Missing session");
  return c;
}
export function useApi() {
  const { session } = useSession();
  return useMemo(
    () => createApi(session ?? { base: "", readToken: "", writeToken: "" }),
    [session],
  );
}
// TanStack hủy request khi query không còn được dùng; refetch không chạy nền khi tab ẩn.
export function polling(interval: number) {
  return (query: {
    state: {
      error: Error | null;
      errorUpdatedAt: number;
      dataUpdatedAt: number;
    };
  }) => {
    const { error, errorUpdatedAt, dataUpdatedAt } = query.state;
    if (error instanceof ApiError) {
      if ([401, 403, 404].includes(error.status)) return false;
      const age = Math.max(0, errorUpdatedAt - dataUpdatedAt);
      return Math.max(
        error.retryAfterMs,
        Math.min(
          60000,
          Math.max(interval * 2, age ? interval * 4 : interval * 2),
        ),
      );
    }
    return interval;
  };
}
