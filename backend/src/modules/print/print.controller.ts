import { Request, Response } from "express";
import { isPrinterOnline } from "../../config/socket";
import * as printService from "./print.service";

const FAILURE_STATUS_CODE: Record<"offline" | "agent-error" | "timeout", number> = {
  offline: 503,
  "agent-error": 502,
  timeout: 504,
};

export async function createPrintJob(req: Request, res: Response) {
  const validated = printService.validatePrintRequest(req.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }

  const { printerId, docs } = validated.value;
  const result = await printService.dispatchPrintJob(printerId, docs);

  // Job id, printerId, staff id, outcome only — never the document content.
  console.log(
    `[print] printerId=${printerId} staffId=${req.staff?.id} docs=${docs.length} printed=${result.printed} outcome=${result.failure?.status ?? "success"}`,
  );

  if (!result.failure) {
    res.status(200).json({ printed: result.printed });
    return;
  }
  res.status(FAILURE_STATUS_CODE[result.failure.status]).json({ error: result.failure.message });
}

export function getPrintStatus(req: Request, res: Response) {
  const { printerId } = req.query;
  if (printerId !== undefined && typeof printerId !== "string") {
    res.status(400).json({ error: "printerId must be a single string value" });
    return;
  }
  res.json({ online: isPrinterOnline(printerId ?? "main") });
}
