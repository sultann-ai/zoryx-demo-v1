# Table sync — POS manual test script

Covers every POS case of the scenario matrix in [TABLE_SYNC_SPEC.md](./TABLE_SYNC_SPEC.md) §5. Run it top to bottom; each block starts from the state the one before left. "Expect" lines are what must be true; anything else is a bug.

## Setup

- Backend with the table-sync migrations applied; a fresh active business day; QR ordering on, PIN on (Store settings → Table QR).
- Dining areas: **Table 2**, **Table 3** and **Table 4** in area **Family Hall**; **Table 5** in **Rooftop**; **Table 6** in Family Hall marked **out of service**.
- Accounts and screens, side by side:
  - **A**: POS admin, browser window 1, on **Tables** (`/tables`).
  - **B**: a second POS admin (or super admin), another browser profile, on **New order**.
  - **W**: order taker, phone or narrow window, on `/take-order`.
  - **K**: Kitchen Display (`/kitchen-display`, All kitchens).
  - **G**: optional guest phone for the QR steps.
- Have one item on the QR menu.

## 1. POS order on a free table — Family Hall · Table 2 (S1)

1. On **B**, New order → Dine in. Expect: every table tile shows a word under its name — Table 2 "Free", Table 6 greyed out and disabled with "Out of service" (hover shows the reason).
2. Tap **Family Hall → Table 2**. Expect the line under the grid: "**Family Hall · Table 2 is free.** Sending this order seats it — the table shows as taken right away."
3. Add one item, send.
   - Expect on **B**: Order Detail opens with a green "Family Hall · Table 2 is now open and shows as taken on the map. Guests' join PIN: ####", and a **Table** card saying "On the table's bill · In kitchen".
   - Expect on **A** within a second, without reloading: Table 2's tile turns **In kitchen**, meta "1 order · just now".
   - Expect on **K**: the item's card says Table 2.
4. On **A**, tap Table 2. Expect: the order listed as **#n · POS**, **New order for Table 2**, PIN block, **Print table bill**, **Move party**, **Merge tables**, a **Close table** section saying "Not ready to close: 1 order isn't paid yet (Rs …), 1 still open in the kitchen…" and **Settle Rs … and close**.

## 2. A second order on the open table — "Add to Table 2's bill" (S2, S26)

1. On **B**, New order → Dine in → Table 2. Expect: the tile says "Open"; the line reads "**Add to Family Hall · Table 2's bill.** It's already open (1 order · Rs …) — this order goes on the same bill."
2. Send. Expect: no "now open" banner; on **A** the sheet lists both orders and the total grows.

## 3. Waiter and cashier on the same free table at the same moment (S5)

1. On **W**, pick **Table 3**: expect "Table 3 is free…" at the top of the items step. Add an item but **don't send yet**.
2. On **B**, New order → Table 3 (also "Free") → add an item. Send **W**, then send **B** straight away.
3. Expect on **W**: "Sent to reception … Table 3 is now open and shows as taken on the map" (with the PIN).
4. Expect on **B**: a dialog "**Table 3 is already open**" with its summary ("Since …, 1 order, Rs …") and **Add to Table 3's bill** / **Pick another table**. Tap **Add to Table 3's bill**: the order is placed, and the sheet on **A** lists it as **POS** next to the **Waiter** one.
5. Repeat with **Pick another table**: the dialog closes, nothing is sent, the cart is still there.

## 4. Two staff seat the same table at once (S6)

1. Open Table 4's sheet on **A** and on **B** (B → Tables). Tap **Seat table** on both quickly.
2. Expect: one succeeds (shows the PIN); the other shows "This table is already seated" and the sheet then shows the open table. Only one session (one PIN) exists.

## 5. Guests on phones and staff orders on one bill (S3, S4)

1. **G** scans Table 2's QR and joins with the PIN. Send one QR round; accept it in Incoming on **A**.
2. Expect on **A** (Table 2's sheet): the three orders labelled **POS**, **POS**, **QR · <guest name>**, and the guest under Guests.
3. Expect on **G**: the Table tab shows the two staff orders too, as "Table (shared)", on the same bill. (The "Added by staff" wording comes with the customer UI step.)

## 6. Rejected or cancelled orders free a table an order opened (S7, S8)

1. On **W**, order for **Table 5** (free). On **A** → Incoming → Reject it with any reason.
2. Expect: Table 5's tile goes back to **Free** within a second.
3. On **B**, order for Table 5 again (it says Free), then on that order's page **Cancel order** with a reason. Expect: Table 5 goes **Free** again.
4. Seat **Table 5** on **A** (Seat table), place a POS order on it, cancel that order. Expect: Table 5 stays **Seated** (a table seated on purpose doesn't free itself).

## 7. Per-order payment is gone for table orders (R4)

1. Open any Table 2 order on **B**. Expect: no **Confirm Payment** card, no **Complete order** button; the header has **Print table bill** and **Print this order only**.
2. **Orders** list: Table 2's rows show **Open table** instead of Complete and no Mark paid button. A takeaway still has Mark paid and Complete.

## 8. Items added or removed after the split started; discount vs split (S9, S10)

1. On **A**, Table 2's sheet → Table bill → **Request bill** → **Split equally** (2 shares).
2. On Order Detail of a Table 2 POS order, **Add item**. Expect: added; on **A** the bill shows "The bill changed. Split it again…".
3. Split again, then on **A** Mark cash collected for share 1. Now try **Add item** on a Table 2 order again. Expect a red message, in words: "…bill already has payments on its shares. Check or unmark them before changing the bill." Nothing is added.
4. On **B**, New order → Table 2 (tile "Open") → send. Expect the same message inline; no order is created.

## 9. Guest paid online while the cashier takes cash (S11)

1. Continue from 8: **G** pays share 2 online and uploads a proof.
2. On **A**, Close table section → **Settle … and close**. Expect: "Some guests have already paid their share. Check those payments, then collect the rest instead."
3. Verify the proof in the bill panel. Expect: the bill shows paid; **Close table** in the bill panel closes it; the tile goes **Free**; **G** sees the receipt.

## 10. Close guard and Force (admins)

1. On **B**, place an order for **Table 4** (it's seated from step 4: tile "Open", "Add to Table 4's bill"). Open Table 4's sheet on **A**.
2. Expect "Not ready to close: 1 order isn't paid yet (Rs …), 1 still open in the kitchen…", **Settle Rs … and close**, and **Force close…**.
3. **Force close…** → expect the dialog to explain the table has 1 accepted order and offer **Settle instead** plus a link to the order (to cancel it with a reason). No way to close while money is owed.
4. **Settle instead** → Cash, cash received larger than the total → the change is shown live → **Settle and close**. Expect: "Table 4 is settled and closed. Change to give: Rs …" and the tile **Free**.
5. Seat **Table 4** again, have **W** send an order for it but don't accept it. **Force close…** → **Void table** with a reason. Expect: the table is Free and the waiting order is rejected (gone from Incoming, W's My orders shows it rejected).
6. Sign in as **W**, open a table someone else waits on: the Close section has no Settle button; on their own table it has Settle (cash only, no discount field) and no Force.

## 11. Move an order (S12)

1. Place a POS order on Table 3 (open from step 3). On its Order Detail → **Move to table…**. Expect: Table 6 disabled ("Out of service"), free tables say "Free", open ones their state.
2. Pick a **free** table (e.g. Table 5 if free). Expect the sentence "…Table 5 is free, so this seats it. It leaves Table 3's bill." Confirm. Expect: "Moved to Table 5. The kitchen sees the new table."; **K**'s card shows Table 5; both tiles update.
3. Move it again to an **open** table. Expect "…add it to <table>'s bill (…)". Confirm.
4. Open a QR round's page (from step 5). Expect no **Move to table…** button (a guest's round moves with the party).
5. Two windows: open the move picker on **B**, meanwhile seat the target table on **A**, then confirm on **B**. Expect the dialog "<table> is already open … Add to <table>'s bill?".

## 12. Move the party (S13)

1. Table 2's sheet (guest **G** joined) → **Move party** → tiles of open tables say "Taken — merge instead". Pick a free table, confirm.
2. Expect: the old tile Free, the new one shows the orders; **K** cards show the new table; **G**'s phone keeps working and shows the new table's name (the "your table moved" banner comes with the customer UI step).

## 13. Merge tables (S14)

1. Have two open tables, X and Y. X's sheet → **Merge tables** → free tables say "Free — move the party instead". Pick Y, read the sentence, confirm.
2. Expect: X's tile reads "with Y" in Y's state; X's sheet says "X is joined to Y — its orders and bill are on Y" with **Open Y**; Y's sheet shows "Joined tables: X" and every order of both.
3. **New order** on X (tile "With Y"): expect "Add to X's bill … joined with Y" and the order lands on Y's bill.
4. Settle Y: expect both X and Y go Free.
5. Merge two tables where one bill has a paid share: expect the server's sentence about payments in the dialog, nothing merged.

## 14. Table admin while open (S16)

1. Dining areas → edit an open table → tick inactive or out of service → Save. Expect: "<table> has guests (open since …). Close or move them first."
2. Tables → an open table → **Regenerate QR**: the warning says seated guests stay signed in and anyone new needs the new card.

## 15. Scheduled order on a table (S17)

1. On **B**, Dine in → a table → **Schedule for later** (soon) → send. Expect: the table stays as it was (no session yet), and Order Detail says "Takes the table when it's released."
2. Before it releases, seat that table on **A**. When it releases, accept it in Incoming. Expect the dialog "<table> is busy … **Add to <table>'s bill**" (Not now leaves it in Incoming with a sentence on how to move it). Add it: it appears on the table's sheet.
3. Repeat with the table free at release: it's on the table already when it reaches Incoming.

## 16. End Day with open tables (S18)

1. Leave one table open with an unpaid order, and one seated with nothing on it. **End day**.
2. Expect the dialog "Finish these orders…" with a **Tables still open** list: each with since/orders/"Rs … owed" or "Nothing owed", **Open table to settle**, **Close** (only for the one owing nothing), and a line saying what "End anyway" does to each. The table's order says "Settle with its table below" instead of Complete.
3. **Close** the empty one: it leaves the list.
4. **End anyway**. Expect a notice listing tables closed with the day and the one left "From yesterday"; on the map that table reads **From yesterday** (danger).
5. Start a new day. New order: that table is disabled with "From yesterday"; its sheet says it can take no new orders; **Settle … and close** still works.

## 17. Staff and reconnects (S19, S20)

1. Deactivate **W** while W is a table's waiter (Staff page). Expect W's screen logs out; that table's sheet shows Waiter "Anyone".
2. On **A**, turn the network off (DevTools → Offline) for 20 s while **B** places an order on a free table, then back on. Expect: within a second of reconnecting, A's map shows the table taken, without a reload. Repeat on **W**'s Tables tab and on **K**.

## 18. Every refusal reads as a sentence

While doing the above, no message may show a raw code, "Request failed with status code 409", or JSON. Spot checks: stop the backend and send an order ("Couldn't reach the server…"); as **W** call a Super Admin-only action through a stale tab ("You don't have permission to do that.").
