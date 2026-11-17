/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // The customer website, for the "Open customer website" button. Optional.
  readonly VITE_ONLINE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
