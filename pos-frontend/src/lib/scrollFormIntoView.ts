// Screens put their add/edit form above the list, and "Edit" is a button in a
// row of that list. When the list is scrolled down, tapping Edit would fill a
// form the person can't see — and a beginner won't know where to look. Bring
// the form to the top of the view on every screen size. If the whole form is
// already on screen, leave the scroll alone so short pages don't jump.
export function scrollFormIntoView(element: HTMLElement | null): void {
  if (!element) {
    return;
  }
  const rect = element.getBoundingClientRect();
  const isFullyVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
  if (isFullyVisible) {
    return;
  }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}
