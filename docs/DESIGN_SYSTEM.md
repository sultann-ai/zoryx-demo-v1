Here's the design plan — visual specimen published at: https://claude.ai/artifact/NHjpmfnQemN2MkvzYxQYZ1

Summary of the decisions:

Base palette (6 hex, functional-first): Ink #1B1F27, Ink Muted #5B6472, Surface #F6F3EA (warm cream app background), Surface Raised #FFFFFF, Border #DDD9CB, and one deliberate brand color, Zoryx Forest Green #1F4D3A (with cream #F6F1E4 and lime #C6E84A used by the logo only), used only for primary actions, links, focus rings, and the active nav marker — never decoratively, never as a status color, so it stays legible as "this is clickable."

Status language — five semantic states reused everywhere, always paired with a text label, never color alone:

Neutral #5B6472 — pending / not started
Active #2A6F97 — confirmed, in kitchen, preparing
Success #3A7D44 — ready, served, completed, verified
Warning #B8792A — awaiting verification, low stock
Danger #C0392B — cancelled, rejected
Deliberately kept distinct in hue from the forest green accent so "primary action" and "cancelled" are never visually confusable. In dense tables these render as a small dot + colored text (quiet); on Kitchen Display tickets, where only a handful are on screen, they can be bolder (a solid color header bar).

Typography: two typefaces with sharply divided jobs — Bricolage Grotesque (a warm, slightly old-world serif) only on page/section titles, and DM Sans for everything else — labels, buttons, table cells, and every number. Numbers use DM Sans's tabular lining figures, not a separate monospace face. Size scale: 24px titles → 18px sections → 15px card/table heads → 14px body/cells → 12.5px meta → 17px numeric emphasis.

Layout/spacing: tables (not cards) for lists; cards earned only by Kitchen tickets and Dashboard stat tiles; borders instead of drop shadows; one 4px radius everywhere; a tight 4/8/12/16/24/32/48px spacing scale for density, but 44px minimum touch targets on anything tapped mid-service; sentence-case labels; verb-first buttons with no arrows.

Why it reads as Zoryx and not a template: the forest green is a calm, ledger-like base rather than a loud marketing colour; Bricolage Grotesque gives the handful of words read slowly per screen some warmth (fitting a name that means "guide") while everything actionable snaps back to plain fast sans; status colors are quiet signals rather than shouting pills, because the goal during service is a room scannable in half a second, not a dashboard performing busyness.

The artifact is private to you for now — let me know if you want it shared, and once you've reviewed it I can start applying this to the actual app.