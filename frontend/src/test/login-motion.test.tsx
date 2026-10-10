import { afterEach, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Connection } from "../pages/Connection";
const connect = vi.fn();
vi.mock("../session", () => ({ useSession: () => ({ connect }) }));
vi.mock("../api/accounts", () => ({ login: vi.fn() }));
import { login } from "../api/accounts";
const result = { token: "test-only", user: { id: "test", username: "viewer", role: "viewer" as const, disabled: false, mustChangePassword: false } };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); connect.mockReset(); });
async function submit() {
 const u = userEvent.setup();
 await u.type(screen.getByLabelText("Tên đăng nhập"), "viewer");
 await u.type(screen.getByLabelText("Mật khẩu"), "test-only-password");
 await u.click(screen.getByRole("button", { name: "Đăng nhập" }));
}
it("chỉ mở session sau khi card trượt xong; viewer không được cấp write token", async () => {
 vi.mocked(login).mockResolvedValue(result);
 vi.stubGlobal("matchMedia", () => ({ matches: false }));
 let finish!: () => void;
 const finished = new Promise<void>(r => { finish = r; });
 const animate = vi.fn(() => ({ finished, cancel: vi.fn() }));
 Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
 render(<Connection />); await submit();
 await waitFor(() => expect(animate).toHaveBeenCalled());
 expect(connect).not.toHaveBeenCalled();
 expect(screen.getByLabelText("Mật khẩu")).toHaveValue("");
 expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeDisabled();
 await act(async () => finish());
 expect(connect).toHaveBeenCalledWith(expect.objectContaining({ readToken: "test-only", writeToken: "" }));
 delete (Element.prototype as unknown as { animate?: unknown }).animate;
});
it("lỗi xác thực giữ lại form và không mở session", async () => {
 vi.mocked(login).mockRejectedValue(new Error("Tài khoản không hợp lệ"));
 render(<Connection />); await submit();
 expect(await screen.findByRole("alert")).toHaveTextContent("Tài khoản không hợp lệ");
 expect(connect).not.toHaveBeenCalled();
 expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();
});
it("giảm chuyển động vẫn đăng nhập được; chuyển ngôn ngữ đổi label và placeholder", async () => {
 vi.mocked(login).mockResolvedValue(result);
 vi.stubGlobal("matchMedia", () => ({ matches: true }));
 render(<Connection />); const u = userEvent.setup();
 await u.click(screen.getByRole("button", { name: "English" }));
 expect(screen.getByLabelText("Username")).toHaveAttribute("placeholder", "Enter your username");
 await u.click(screen.getByRole("button", { name: "Tiếng Việt" }));
 await submit(); expect(connect).toHaveBeenCalledTimes(1);
});
