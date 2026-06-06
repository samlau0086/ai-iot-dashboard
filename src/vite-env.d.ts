/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEVICE_API_URL?: string;
  readonly VITE_DEVICE_API_TOKEN?: string;
  readonly VITE_DEVICE_API_POLL_MS?: string;
  readonly VITE_MQTT_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
