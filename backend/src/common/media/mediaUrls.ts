// Paths (relative to the API origin) the website and POS use to display a stored image.
// The website prefixes its own API base URL.
export function mediaUrls(id: string) {
  return {
    thumb: `/api/online/media/${id}?size=thumb`,
    full: `/api/online/media/${id}?size=full`,
  };
}
