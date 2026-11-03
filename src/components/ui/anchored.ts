import { useLayoutEffect, type RefObject } from "react";

/** Space between the trigger and the panel, and the least space kept from the screen edges. */
const GAP = 4;
const EDGE = 8;

/**
 * Keeps a floating panel (position: fixed, rendered in a portal and starting
 * invisible) next to its trigger: below it, or above when there is more room
 * there, lined up with the trigger's start or end edge (end is left in
 * Arabic, right in English) and always inside the screen. A panel taller than
 * the room on either side scrolls inside the larger side instead of covering
 * its trigger. It follows the trigger while the page or any container
 * scrolls, so a scrolling table never cuts it off. Shared by the menu and the
 * role permissions card.
 */
export function useAnchoredPanel(open: boolean, anchorRef: RefObject<HTMLElement | null>, panelRef: RefObject<HTMLElement | null>, align: "start" | "end") {
  // Placed before it is painted, then kept next to the trigger while the page or any container scrolls.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!open || !panel || !anchor) return;
    const place = () => {
      panel.style.maxHeight = "";
      const a = anchor.getBoundingClientRect();
      const w = panel.offsetWidth;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const roomBelow = vh - a.bottom - GAP - EDGE;
      const roomAbove = a.top - GAP - EDGE;
      const room = Math.max(roomBelow, roomAbove);
      if (panel.offsetHeight > room) {
        panel.style.maxHeight = `${Math.max(room, 0)}px`;
        panel.style.overflowY = "auto";
      }
      const h = panel.offsetHeight;
      const top = h > roomBelow && roomAbove > roomBelow ? a.top - GAP - h : a.bottom + GAP;
      const rtl = getComputedStyle(anchor).direction === "rtl";
      const left = (align === "end") !== rtl ? a.right - w : a.left;
      panel.style.top = `${Math.round(Math.max(EDGE, Math.min(top, vh - h - EDGE)))}px`;
      panel.style.left = `${Math.round(Math.max(EDGE, Math.min(left, vw - w - EDGE)))}px`;
      panel.style.visibility = "visible";
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align, anchorRef, panelRef]);
}
