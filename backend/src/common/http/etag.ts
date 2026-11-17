// True when an If-None-Match request header matches `etag` (RFC 9110 weak comparison: a "W/"
// prefix is ignored, "*" matches anything, and the header may be a comma-separated list).
export function ifNoneMatchMatches(header: string | undefined, etag: string): boolean {
  if (!header) {
    return false;
  }
  const strip = (value: string) => value.trim().replace(/^W\//, "");
  const wanted = strip(etag);
  return header.split(",").some((candidate) => {
    const trimmed = candidate.trim();
    return trimmed === "*" || strip(trimmed) === wanted;
  });
}
