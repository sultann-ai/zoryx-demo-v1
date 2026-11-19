# Table bill step 10 — end-to-end test script

Use a fresh active business day, one active QR-enabled table, one POS Admin, and one Order Taker account. Have three phones (or three browser profiles) ready for the guest joins.

1. **Seat.** In POS, open Tables, select the empty table, and choose **Seat table**. Confirm the table changes to **SEATED** and record the displayed join PIN.
2. **Join three guests.** Scan the table QR in each guest profile, enter distinct names (Ali, Sara, Hamza), and the PIN. Confirm the floor panel shows `3 joined`.
3. **Send two rounds.** Guest Ali sends round 1 with two items. Guest Sara sends round 2 with two different items. Accept both rounds in Incoming Orders. Confirm the table panel shows both rounds and the map remains live.
4. **Request the bill.** From the table side sheet, choose **Request bill**. Confirm ordering is locked and the bill shows subtotal, discount, total, and `REQUESTED`.
5. **Apply a discount.** As POS Admin, enter a valid discount and reason, then choose **Apply discount**. Confirm the total and the order detail totals update from the server response.
6. **Split by items.** Choose **Split by items**. Confirm each guest-owned line is assigned to its guest and every share displays its amount and `UNPAID` status.
7. **Choose payment methods.** Have one guest choose cash and request the waiter. In the POS table bill panel choose **Mark cash collected** for that cash share. Have the other two guests choose online and upload payment proofs.
8. **Verify and reject per share.** In the table bill panel (or any TABLE_QR Order Detail), open each proof thumbnail. Verify one proof and reject the other with a reason. Re-upload the rejected proof, open it with the same viewer, and verify it. Confirm the share statuses become `VERIFIED`.
9. **Print and close.** Confirm the bill shows all shares paid. Choose **Print table receipt** and verify the receipt contains both rounds, discount, total, and each payment method. Choose **Close table** and confirm the map returns to **EMPTY**.
10. **Order Taker permissions.** Repeat only the cash collection and receipt-print actions while signed in as Order Taker. Confirm those actions work, while discount, split, and proof verification remain unavailable.

Expected live-map checkpoints: after payment starts, the table tile reads `PAYING 1/3`, then `PAYING 2/3`, and finally `PAYING 3/3` until **Close table** returns it to `EMPTY`.
