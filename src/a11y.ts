import type { Country, Marker, Region } from "./types";
import { countryName } from "./countries";

/**
 * The globe for people who do not use a mouse.
 *
 * A canvas is a picture to assistive technology, so everything it shows is
 * also said in words next to it: a list of the regions and their countries,
 * and a button per marker that turns the globe to it. Keyboard users turn
 * the globe with the arrow keys once the canvas has focus.
 */

export interface KeyboardOptions {
  canvas: HTMLCanvasElement;
  /** Turn by this many degrees per key press. */
  step?: number;
  onTurn: (deltaLongitude: number, deltaTilt: number) => void;
  onHome: () => void;
}

/** Arrow keys turn, Home resets. Returns a function that removes the listener. */
export function makeKeyboardTurnable(options: KeyboardOptions): () => void {
  const { canvas, step = 10 } = options;
  canvas.tabIndex = 0;

  const onKeyDown = (event: KeyboardEvent) => {
    const turn = event.shiftKey ? step * 3 : step;
    switch (event.key) {
      case "ArrowLeft":
        options.onTurn(-turn, 0);
        break;
      case "ArrowRight":
        options.onTurn(turn, 0);
        break;
      case "ArrowUp":
        options.onTurn(0, -turn);
        break;
      case "ArrowDown":
        options.onTurn(0, turn);
        break;
      case "Home":
        options.onHome();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  canvas.addEventListener("keydown", onKeyDown);
  return () => canvas.removeEventListener("keydown", onKeyDown);
}

export interface AccessibleListOptions {
  regions: Region[];
  markers: Marker[];
  onMarker: (marker: Marker) => void;
  onCountry?: (country: Country) => void;
}

/**
 * Builds the spoken equivalent of the globe: a visually hidden block with a
 * heading, the regions as lists of country names, and a button per marker.
 *
 * Hidden with the usual clip technique rather than `display: none`, which
 * would hide it from screen readers too.
 */
export function createAccessibleList(options: AccessibleListOptions): HTMLElement {
  const root = document.createElement("div");
  root.className = "terrella__a11y";
  root.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";

  for (const region of options.regions) {
    const heading = document.createElement("p");
    heading.textContent = region.name ?? region.id;
    root.appendChild(heading);

    const list = document.createElement("ul");
    for (const id of region.countries ?? []) {
      const item = document.createElement("li");
      item.textContent = countryName(id);
      list.appendChild(item);
    }
    root.appendChild(list);
  }

  if (options.markers.length > 0) {
    const heading = document.createElement("p");
    heading.textContent = "Markers";
    root.appendChild(heading);

    const list = document.createElement("ul");
    for (const marker of options.markers) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = marker.name;
      button.addEventListener("click", () => options.onMarker(marker));
      item.appendChild(button);
      list.appendChild(item);
    }
    root.appendChild(list);
  }

  return root;
}
