import { act, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LoginBackdrop } from "../components/LoginBackdrop";

it("preserves the same animated artwork across login and route renders", () => {
  const view = render(<LoginBackdrop collapsed={false} />);
  const svg = view.container.querySelector("svg");
  expect(view.container.querySelectorAll("path")).toHaveLength(118);
  view.rerender(<LoginBackdrop collapsed />);
  expect(view.container.querySelector("svg")).toBe(svg);
  expect(view.container.firstChild).toHaveClass("collapsed");
  view.rerender(<LoginBackdrop collapsed={false} />);
  expect(view.container.querySelector("svg")).toBe(svg);
  expect(view.container.firstChild).not.toHaveClass("collapsed");
});

it("pauses only while hidden and removes the visibility listener on unmount", () => {
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const remove = vi.spyOn(document, "removeEventListener");
  const view = render(<LoginBackdrop collapsed={false} />);
  hidden.mockReturnValue(true);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(view.container.firstChild).toHaveAttribute("data-paused", "true");
  hidden.mockReturnValue(false);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(view.container.firstChild).toHaveAttribute("data-paused", "false");
  view.unmount();
  expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
});
