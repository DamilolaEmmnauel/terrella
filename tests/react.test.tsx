import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { Globe } from "../src/react/index";

/**
 * The React component, on the server.
 *
 * There is no DOM here, which is exactly the situation the `fallback` prop
 * exists for: the markup must carry the picture, and nothing may touch a
 * canvas until an effect runs in a browser.
 */
describe("<Globe>", () => {
  it("renders the fallback markup on the server", () => {
    const html = renderToString(<Globe fallback='<svg data-globe="1"></svg>' className="hero" />);
    expect(html).toContain('class="hero"');
    expect(html).toContain('<svg data-globe="1"></svg>');
  });

  it("renders an empty positioned host without a fallback", () => {
    const html = renderToString(<Globe />);
    expect(html).toMatch(/^<div style="position:relative"><\/div>$/);
  });
});
