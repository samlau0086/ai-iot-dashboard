import { useEffect } from 'react';
import { useAppStore } from '../lib/store';
import type { DeviceTelemetryMessage } from '../types';

const GATEWAY_TELEMETRY_POLL_MS = 2000;

export function useDeviceDataConnection() {
  const applyTelemetryMessage = useAppStore((state) => state.applyTelemetryMessage);

  useEffect(() => {
    let cancelled = false;
    let since = '';

    const fetchTelemetry = async () => {
      try {
        const url = since ? `/api/telemetry?since=${encodeURIComponent(since)}` : '/api/telemetry';
        const response = await fetch(url);
        if (!response.ok) return;

        const payload = await response.json();
        const messages = Array.isArray(payload?.messages) ? payload.messages : [];

        if (!cancelled) {
          for (const message of messages) {
            applyTelemetryMessage(message as DeviceTelemetryMessage, 'api');
            if (typeof message.received_at === 'string') {
              since = message.received_at;
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to poll gateway telemetry', error);
        }
      }
    };

    fetchTelemetry();
    const intervalId = window.setInterval(fetchTelemetry, GATEWAY_TELEMETRY_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [applyTelemetryMessage]);
}
