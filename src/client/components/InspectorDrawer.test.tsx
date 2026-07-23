import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspectorDrawer, type InspectorMode } from "./InspectorDrawer";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function ToggleableInspector({ presentation }: { presentation: "overlay" | "rail" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open inspector</button>
      <InspectorDrawer
        open={open}
        mode="role"
        title="Software Engineer Intern"
        presentation={presentation}
        onClose={() => setOpen(false)}
      >
        <button type="button">Apply</button>
      </InspectorDrawer>
    </>
  );
}

describe("InspectorDrawer", () => {
  it("traps focus, locks scrolling, dismisses from the backdrop, and restores focus in overlay mode", async () => {
    const user = userEvent.setup();
    render(<ToggleableInspector presentation="overlay" />);
    const opener = screen.getByRole("button", { name: "Open inspector" });

    await user.click(opener);

    expect(screen.getByRole("dialog", { name: "Software Engineer Intern" })).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("button", { name: "Close details" })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Apply" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close details" })).toHaveFocus();

    const backdrop = document.querySelector<HTMLElement>(".inspector-backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.mouseDown(backdrop!);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(opener).toHaveFocus();
  });

  it("keeps rail mode nonmodal while retaining Escape dismissal", async () => {
    const user = userEvent.setup();
    render(<ToggleableInspector presentation="rail" />);
    const opener = screen.getByRole("button", { name: "Open inspector" });

    await user.click(opener);

    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-modal");
    expect(document.querySelector(".inspector-backdrop")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByRole("button", { name: "Close details" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("keeps one shell while role mode exposes company navigation and company mode stands alone", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    function SwitchingInspector() {
      const [mode, setMode] = useState<InspectorMode>("role");
      return (
        <InspectorDrawer
          mode={mode}
          title={mode === "role" ? "Software Engineer Intern" : "NVIDIA"}
          presentation="rail"
          onClose={close}
          backAction={mode === "role" ? {
            label: "View NVIDIA company profile",
            onClick: () => setMode("company"),
          } : undefined}
        >
          {mode === "role"
            ? <p>Role facts</p>
            : <button type="button" onClick={() => setMode("role")}>Open Software Engineer Intern</button>}
        </InspectorDrawer>
      );
    }

    const { container } = render(<SwitchingInspector />);
    const originalShell = container.querySelector(".inspector-shell");
    expect(screen.getByRole("button", { name: "View NVIDIA company profile" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "View NVIDIA company profile" }));

    expect(screen.getByRole("dialog", { name: "NVIDIA" })).toBeInTheDocument();
    expect(container.querySelector(".inspector-shell")).toBe(originalShell);
    expect(originalShell).toHaveAttribute("data-inspector-mode", "company");
    expect(screen.queryByRole("button", { name: /company profile/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close details" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Open Software Engineer Intern" }));
    expect(screen.getByRole("dialog", { name: "Software Engineer Intern" })).toBeInTheDocument();
    expect(container.querySelector(".inspector-shell")).toBe(originalShell);
    expect(screen.getByRole("button", { name: "View NVIDIA company profile" })).toHaveFocus();
  });
});
