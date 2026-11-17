import { Response } from "express";
import ExcelJS from "exceljs";

export async function sendWorkbookAsXlsx(res: Response, workbook: ExcelJS.Workbook, filename: string): Promise<void> {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}
