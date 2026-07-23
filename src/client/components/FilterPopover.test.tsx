import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type FilterOption,
  MultiSelectPopover,
  SingleSelectPopover,
} from "./FilterPopover";

const areaOptions = [
  { value: "backend", label: "Backend" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "frontend", label: "Frontend" },
] as const satisfies readonly FilterOption<string>[];

const sortOptions = [
  { value: "recommended", label: "Best match" },
  { value: "newest", label: "Newest first" },
  { value: "company", label: "Company A–Z" },
] as const satisfies readonly FilterOption<string>[];

function MultiSelectHarness({ initialSelected = [] }: { initialSelected?: string[] }) {
  const [selected, setSelected] = useState(initialSelected);
  const [open, setOpen] = useState(false);
  return (
    <>
      <MultiSelectPopover
        label="Technical areas"
        summary={selected.length ? `Areas · ${selected.length}` : "All areas"}
        options={areaOptions}
        selected={selected}
        onChange={setSelected}
        open={open}
        onOpenChange={setOpen}
        searchable
        searchPlaceholder="Search technical areas…"
      />
      <button type="button">Outside control</button>
      <output aria-label="Selected areas">{selected.join(",")}</output>
    </>
  );
}

function SingleSelectHarness() {
  const [value, setValue] = useState("recommended");
  const [open, setOpen] = useState(false);
  return (
    <SingleSelectPopover
      label="Sort roles"
      options={sortOptions}
      value={value}
      onChange={setValue}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

function DrawerSelectHarness({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState("off");
  const [open, setOpen] = useState(false);
  return (
    <SingleSelectPopover
      label="Alert frequency for Acme Systems"
      heading="Alerts"
      options={[
        { value: "immediate", label: "Immediate" },
        { value: "daily", label: "Daily digest" },
        { value: "off", label: "Off" },
      ]}
      value={value}
      onChange={setValue}
      open={open}
      onOpenChange={setOpen}
      variant="drawer"
      triggerPrefix="Alerts"
      leadingIcon={<svg data-testid="alert-leading-icon" />}
      disabled={disabled}
    />
  );
}

describe("filter popovers", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    vi.restoreAllMocks();
  });

  it("opens from the keyboard, keeps multiple checkbox selections, and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(<MultiSelectHarness />);

    await user.tab();
    const trigger = screen.getByRole("button", { name: "Technical areas: All areas" });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Technical areas" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", dialog.id);
    expect(screen.getByRole("textbox", { name: "Search technical areas…" })).toHaveFocus();

    await user.tab();
    const backend = within(dialog).getByRole("checkbox", { name: "Backend" });
    expect(backend).toHaveFocus();
    await user.keyboard(" ");
    await user.tab();
    const infrastructure = within(dialog).getByRole("checkbox", { name: "Infrastructure" });
    expect(infrastructure).toHaveFocus();
    await user.keyboard(" ");

    expect(backend).toBeChecked();
    expect(infrastructure).toBeChecked();
    expect(screen.getByRole("dialog", { name: "Technical areas" })).toBeInTheDocument();
    expect(screen.getByLabelText("Selected areas")).toHaveTextContent("backend,infrastructure");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Technical areas" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Technical areas: Areas · 2" })).toHaveFocus());
  });

  it("searches the large option set without losing a selected value hidden by the query", async () => {
    const user = userEvent.setup();
    render(<MultiSelectHarness initialSelected={["backend"]} />);

    await user.click(screen.getByRole("button", { name: "Technical areas: Areas · 1" }));
    const search = screen.getByRole("textbox", { name: "Search technical areas…" });
    await user.type(search, "front");

    expect(screen.getByRole("checkbox", { name: "Frontend" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Backend" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Selected areas")).toHaveTextContent("backend");

    await user.click(screen.getByRole("button", { name: "Clear Technical areas search" }));
    expect(screen.getByRole("checkbox", { name: "Backend" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Frontend" })).not.toBeChecked();
  });

  it("closes on an outside pointer interaction without clearing selections", async () => {
    const user = userEvent.setup();
    render(<MultiSelectHarness />);

    await user.click(screen.getByRole("button", { name: "Technical areas: All areas" }));
    await user.click(screen.getByRole("checkbox", { name: "Backend" }));
    expect(screen.getByRole("dialog", { name: "Technical areas" })).toBeInTheDocument();

    const outside = screen.getByRole("button", { name: "Outside control" });
    await user.click(outside);
    expect(screen.queryByRole("dialog", { name: "Technical areas" })).not.toBeInTheDocument();
    expect(outside).toHaveFocus();
    expect(screen.getByLabelText("Selected areas")).toHaveTextContent("backend");
  });

  it("supports keyboard selection in the custom single-select sort control", async () => {
    const user = userEvent.setup();
    render(<SingleSelectHarness />);

    const trigger = screen.getByRole("button", { name: "Sort roles: Best match" });
    await user.click(trigger);
    const options = screen.getByRole("radiogroup", { name: "Sort roles options" });
    expect(within(options).getByRole("radio", { name: "Best match" })).toHaveFocus();

    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.queryByRole("dialog", { name: "Sort roles" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort roles: Newest first" })).toHaveFocus();
  });

  it("renders the drawer single-select variant with a quiet prefix and selects a radio option", async () => {
    const user = userEvent.setup();
    const { container } = render(<DrawerSelectHarness />);

    const trigger = screen.getByRole("button", { name: "Alert frequency for Acme Systems: Off" });
    expect(trigger).toHaveTextContent("Alerts");
    expect(trigger).toHaveTextContent("Off");
    expect(screen.getByTestId("alert-leading-icon").closest("span")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("select")).not.toBeInTheDocument();

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Alerts" });
    const options = within(dialog).getByRole("radiogroup", { name: "Alert frequency for Acme Systems options" });
    expect(within(options).getByRole("radio", { name: "Off" })).toHaveAttribute("aria-checked", "true");

    await user.click(within(options).getByRole("radio", { name: "Immediate" }));
    expect(screen.queryByRole("dialog", { name: "Alerts" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alert frequency for Acme Systems: Immediate" })).toHaveFocus();
  });

  it("keeps a pending drawer trigger focusable while guarding activation", async () => {
    const user = userEvent.setup();
    render(<DrawerSelectHarness disabled />);

    const trigger = screen.getByRole("button", { name: "Alert frequency for Acme Systems: Off" });
    expect(trigger).toHaveAttribute("aria-disabled", "true");
    expect(trigger).not.toBeDisabled();
    await user.click(trigger);
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("dialog", { name: "Alerts" })).not.toBeInTheDocument();
  });
});
