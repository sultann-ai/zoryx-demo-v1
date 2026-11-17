# Zoryx print agent

Runs on the cashier's PC (not on Railway/Vercel — this never gets deployed anywhere). Connects
out to the cloud backend over Socket.io, receives print jobs, and sends them to the physical
thermal printer attached to this PC. The protocol it speaks is documented in
`docs/PRINT_PROTOCOL.md` at the repo root.

## Windows setup

1. Install [Node.js](https://nodejs.org/) (LTS) if it isn't already on this PC.
2. In this folder:
   ```
   npm install
   copy .env.example .env
   ```
3. Edit `.env`:
   - `BACKEND_URL` — the backend's address.
   - `PRINT_AGENT_KEY` — must match the backend's `PRINT_AGENT_KEY` exactly.
   - Leave `PRINTER_INTERFACE=preview` for now — see "Test without a printer" below.
4. Once you're ready to point this at the real printer, find its exact identifier:
   - **USB (installed as a Windows printer)**: Settings → Bluetooth & devices → Printers &
     scanners, or run `Get-Printer | Select Name` in PowerShell. Copy the name exactly
     (spaces and all) into `PRINTER_INTERFACE=printer:<exact name>`.
   - **LAN**: the printer's IP address, usually shown on a self-test page or its own network
     settings menu. `PRINTER_INTERFACE=tcp://<ip>:9100`.
   - **Bluetooth-serial**: pair it in Windows first, then check Device Manager → Ports
     (COM & LPT) for the COM port Windows assigned it. `PRINTER_INTERFACE=COM3` (or whichever
     number). This path hasn't been verified against real hardware yet — if it doesn't work,
     say so and it'll need a closer look.
5. Test the hardware directly (no backend involved):
   ```
   npm run test-print
   ```
   This should print a receipt with every text size, bold, a wrapped line, both rule styles, a
   character test, and a cut. If it doesn't look right, fix `PRINTER_INTERFACE`/
   `PRINTER_WIDTH_CHARS`/`PRINTER_CHARSET` before going further.
6. Run it for real:
   ```
   npm start
   ```
   (or `npm run dev` while iterating — auto-restarts on code changes.)

## Test without a printer

`PRINTER_INTERFACE=preview` (the default) or `DRY_RUN=1` skips the real printer entirely: every
job is rendered to the console as plain text at exactly `PRINTER_WIDTH_CHARS` width, and the raw
ESC/POS bytes are saved to `out/last-job.bin` so you can inspect them. `npm run test-print` and
`npm run dev`/`npm start` all work the same way in this mode.

**Text wrapping** (`src/layout.ts`'s `wrapText`): every text block is word-wrapped to `PRINTER_WIDTH_CHARS` (half that for size-3 text) before it reaches the printer, so a long item name or note never runs off the paper or breaks mid-word. Continuation lines keep the line's indent, plus 2 spaces for left-aligned text. The console preview uses the same layout, so what it shows is what prints. **Rebuild and restart the agent** after updating it (`npm run build`, then `npm start`) to pick this up. An older agent still prints, but leaves long lines to the printer to break.

## Running automatically at Windows startup

1. First build it: `npm run build` (produces `dist/index.js`, which `start-agent.bat` runs).
2. Press `Win+R`, type `shell:startup`, press Enter — this opens your Startup folder.
3. Right-click → New → Shortcut, point it at `start-agent.bat` in this folder.
4. That's it — next time Windows starts, so does the agent, in its own console window.

`start-agent.bat` restarts the agent automatically if it ever crashes (a simple retry loop, no
extra tooling needed) — leave that window open; closing it stops the agent.

After a code update, re-run `npm run build` and restart the agent (close its window, re-open the
Startup shortcut, or just reboot).
