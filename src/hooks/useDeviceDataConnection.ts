import { useEffect } from 'react';
import { useAppStore } from '../lib/store';
import type { DeviceTelemetryMessage } from '../types';

const GATEWAY_TELEMETRY_POLL_MS = 2000;

export function useDeviceDataConnection() {
  const applyTelemetryMessage = useAppStore((state) => state.applyTelemetryMessage);
  const setDeviceDataSourceStatus = useAppStore((state) => state.setDeviceDataSourceStatus);

  useEffect(() => {
    let cancelled = false;
    let since = '';
    let realtimeConnected = false;
    let eventSource: EventSource | null = null;

    const fetchTelemetry = async () => {
      if (realtimeConnected) return;
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
          setDeviceDataSourceStatus('error');
        }
      }
    };

    if (typeof window !== 'undefined' && 'EventSource' in window) {
      eventSource = new EventSource('/api/realtime/events');
      eventSource.addEventListener('connected', () => {
        realtimeConnected = true;
        setDeviceDataSourceStatus('api');
      });
      eventSource.addEventListener('telemetry', (event) => {
        try {
          realtimeConnected = true;
          const payload = JSON.parse((event as MessageEvent).data || '{}');
          const messages = Array.isArray(payload.messages) ? payload.messages : [];
          for (const message of messages) {
            applyTelemetryMessage(message as DeviceTelemetryMessage, String(payload.source || '').startsWith('mqtt:') ? 'mqtt' : 'api');
            if (typeof message.received_at === 'string') {
              since = message.received_at;
            }
          }
        } catch (error) {
          console.error('Failed to process realtime telemetry', error);
        }
      });
      eventSource.onerror = () => {
        realtimeConnected = false;
        setDeviceDataSourceStatus('error');
      };
    }

    fetchTelemetry();
    const intervalId = window.setInterval(fetchTelemetry, GATEWAY_TELEMETRY_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      eventSource?.close();
    };
  }, [applyTelemetryMessage, setDeviceDataSourceStatus]);
}
