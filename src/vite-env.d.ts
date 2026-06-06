/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEVICE_API_URL?: string;
  readonly VITE_DEVICE_API_TOKEN?: string;
  readonly VITE_DEVICE_API_POLL_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
