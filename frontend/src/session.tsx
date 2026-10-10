import {
  createContext,
  useEffect,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError, createApi, type Session } from "./api/client";
import { accountsApi } from "./api/accounts";
const Context = createContext<{
  session: Session | null;
  sessionError: string;
  connect: (s: Session) => void;
  disconnect: () => void;
} | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
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
  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void accountsApi(session)
        .me(controller.signal)
        .catch((error) => {
          if (!cancelled && error instanceof ApiError && error.status === 401) {
            client.clear();
            setSessionError(
              "Phiên đăng nhập đã hết hạn hoặc bị quản trị viên thu hồi. Hãy đăng nhập lại.",
            );
            setSession(null);
          }
        });
    }, 30000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [session, client]);
  const clear = () => {
    void client.cancelQueries();
    client.clear();
  };
  return (
    <Context.Provider
      value={{
        session,
        sessionError,
        connect: (s) => {
          clear();
          setSessionError("");
          setSession(s);
        },
        disconnect: () => {
          if (session?.user)
            void accountsApi(session)
              .logout()
              .catch(() => {});
          clear();
          setSessionError("");
          setSession(null);
        },
      }}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
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
