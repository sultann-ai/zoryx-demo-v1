import { NextFunction, Request, Response } from "express";

// helmet's default Cross-Origin-Resource-Policy is same-origin, which is right for the JSON API.
// Routes whose whole purpose is to be embedded by a site on another origin (<img src=...>)
// opt out explicitly, one route at a time, with this.
export function allowCrossOriginResource(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}
