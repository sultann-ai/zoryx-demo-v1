import { Request, Response } from "express";
import { karachiDate } from "../../common/pkTime";
import * as businessDayService from "./businessDay.service";
import * as orderService from "../order/order.service";

export async function getCurrent(_req: Request, res: Response) {
  const businessDay = await businessDayService.getActiveBusinessDay();
  res.json(businessDay ?? null);
}

export async function start(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { label } = req.body ?? {};

  if (label !== undefined && (typeof label !== "string" || label.trim().length === 0)) {
    res.status(400).json({ error: "label must be a non-empty string" });
    return;
  }

  const active = await businessDayService.getActiveBusinessDay();
  if (active) {
    res.status(409).json({ error: "A business day is already active", businessDay: active });
    return;
  }

  // Default label: today's Pakistan date (a day started at 00:30 PK is that date, not yesterday's UTC one).
  const resolvedLabel = typeof label === "string" ? label.trim() : karachiDate(new Date());

  const businessDay = await businessDayService.startBusinessDay(req.staff.id, resolvedLabel);
  res.status(201).json(businessDay);
}

export async function end(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { force } = req.body ?? {};

  if (force !== undefined && typeof force !== "boolean") {
    res.status(400).json({ error: "force must be a boolean" });
    return;
  }

  const active = await businessDayService.getActiveBusinessDay();
  if (!active) {
    res.status(404).json({ error: "No active business day to end" });
    return;
  }

  // Checked before — and regardless of — `force`: a scheduled order left on hold would be
  // released later into a day that's over, where Incoming orders (scoped to the active day)
  // would never show it. The client offers to release or cancel these, then retries.
  const scheduledOrders = await orderService.listScheduledOrdersForBusinessDay(active.id);
  if (scheduledOrders.length > 0) {
    res.status(409).json({
      error: `Cannot end business day: ${scheduledOrders.length} scheduled order(s) haven't been released yet. Release or cancel them first.`,
      code: "SCHEDULED_ORDERS_PENDING",
      scheduledOrders,
    });
    return;
  }

  if (force !== true) {
    const openOrders = await businessDayService.getBlockingOrders(active.id);
    const orderIds = openOrders.map((order) => order.id);
    // Unpaid orders (open or delivered) aren't in the day's sales: list them, by number and
    // amount, so whoever ends the day anyway does it knowingly.
    const unpaid = await businessDayService.getUnpaidOrders(active.id);
    // Table QR: tables still seated. Their guests couldn't order into the next day, so staff close them
    // (or end the day anyway with force).
    const openTableSessions = await businessDayService.getOpenTableSessions(active.id);
    if (orderIds.length > 0 || unpaid.orders.length > 0 || openTableSessions.length > 0) {
      const problems = [
        orderIds.length > 0
          ? `${orderIds.length} order(s) are still open (awaiting reception, pending, confirmed, in kitchen, or ready — not yet marked delivered)`
          : null,
        unpaid.orders.length > 0
          ? `${unpaid.orders.length} order(s) are not marked paid (Rs ${unpaid.total.toFixed(2)}, not counted in sales)`
          : null,
        openTableSessions.length > 0 ? `${openTableSessions.length} table(s) are still seated` : null,
      ].filter((problem): problem is string => problem !== null);
      res.status(400).json({
        code: unpaid.orders.length > 0 ? "UNPAID_ORDERS" : orderIds.length > 0 ? "OPEN_ORDERS" : "OPEN_TABLE_SESSIONS",
        error: `Cannot end business day: ${problems.join("; ")}`,
        orderIds,
        openOrders,
        unpaidOrders: unpaid.orders,
        unpaidTotal: unpaid.total,
        openTableSessions,
      });
      return;
    }
  }

  // Forced: tables that owe nothing close with the day; the rest are listed and stay open (table sync R6).
  const businessDay =
    force === true
      ? await businessDayService.endBusinessDayForced(active.id, req.staff.id)
      : await businessDayService.endBusinessDay(active.id, req.staff.id);
  res.json(businessDay);
}
