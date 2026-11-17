import type { ReactNode } from "react";
import { buttonClassName, PageHeader } from "../ui";
import { ONLINE_SITE_URL } from "../../lib/mediaUrl";

interface OnlineStoreHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  // Page-specific buttons, shown before "Open customer website".
  actions?: ReactNode;
}

// The header every Online store page shares: its title plus an "Open customer website" button that
// opens the live site in a new tab (hidden when VITE_ONLINE_SITE_URL isn't configured). A real link, so
// middle-click and "copy link address" work.
export function OnlineStoreHeader({ title, description, actions }: OnlineStoreHeaderProps) {
  return (
    <PageHeader
      title={title}
      description={description}
      actions={
        <>
          {actions}
          {ONLINE_SITE_URL && (
            <a href={ONLINE_SITE_URL} target="_blank" rel="noopener noreferrer" className={buttonClassName("secondary")}>
              Open customer website
            </a>
          )}
        </>
      }
    />
  );
}
