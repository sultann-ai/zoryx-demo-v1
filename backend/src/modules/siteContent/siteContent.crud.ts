import { Request, Response } from "express";
import { Parsed } from "../../common/validation";
import { respondToSiteContentError } from "./siteContent.errors";

type Body = Record<string, unknown>;

function readBody(req: Request, res: Response): Body | null {
  const body = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    res.status(400).json({ error: "A JSON object body is required" });
    return null;
  }
  return body as Body;
}

// The four website-content lists (delivery areas, payment accounts, gallery, testimonials) are
// the same list/create/update/delete shape; only parsing, persistence, and presentation differ.
export function makeCrudHandlers<Row>(options: {
  label: string;
  list: () => Promise<Row[]>;
  create: (data: Body) => Promise<Row>;
  update: (id: string, data: Body) => Promise<Row>;
  remove: (id: string) => Promise<void>;
  parseCreate: (body: Body) => Parsed<Body>;
  parseUpdate: (body: Body) => Parsed<Body>;
  present?: (row: Row) => unknown;
}) {
  const present = options.present ?? ((row: Row) => row);
  const notFound = `${options.label} not found`;

  return {
    list: async (_req: Request, res: Response) => {
      res.json((await options.list()).map(present));
    },

    create: async (req: Request, res: Response) => {
      const body = readBody(req, res);
      if (!body) return;
      const parsed = options.parseCreate(body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      try {
        res.status(201).json(present(await options.create(parsed.value)));
      } catch (error) {
        if (respondToSiteContentError(error, res, notFound)) return;
        throw error;
      }
    },

    update: async (req: Request, res: Response) => {
      const body = readBody(req, res);
      if (!body) return;
      const parsed = options.parseUpdate(body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      if (Object.keys(parsed.value).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }
      try {
        res.json(present(await options.update(req.params.id as string, parsed.value)));
      } catch (error) {
        if (respondToSiteContentError(error, res, notFound)) return;
        throw error;
      }
    },

    remove: async (req: Request, res: Response) => {
      try {
        await options.remove(req.params.id as string);
        res.status(204).send();
      } catch (error) {
        if (respondToSiteContentError(error, res, notFound)) return;
        throw error;
      }
    },
  };
}
