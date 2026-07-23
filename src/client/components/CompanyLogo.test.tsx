import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CompanyLogo } from "./ui";

afterEach(cleanup);

describe("CompanyLogo", () => {
  it("renders a configured company-level asset", () => {
    const { container } = render(
      <CompanyLogo
        src="/company-logos/cloudflare.ico"
        name="Cloudflare"
        initials="CF"
      />,
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/company-logos/cloudflare.ico",
    );
    expect(container).not.toHaveTextContent("CF");
  });

  it("uses initials when no logo is configured", () => {
    const { container } = render(
      <CompanyLogo src={null} name="Cloudflare" initials="CF" />,
    );

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container).toHaveTextContent("CF");
  });

  it("hides a failed image immediately and replaces it with initials", () => {
    const { container, rerender } = render(
      <CompanyLogo src="/company-logos/missing.svg" name="Cloudflare" initials="CF" />,
    );
    const failedImage = container.querySelector("img");
    expect(failedImage).not.toBeNull();

    fireEvent.error(failedImage!);
    expect(failedImage).toHaveAttribute("hidden");
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container).toHaveTextContent("CF");

    rerender(
      <CompanyLogo src="/company-logos/cloudflare.ico" name="Cloudflare" initials="CF" />,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/company-logos/cloudflare.ico",
    );
  });
});
