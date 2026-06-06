import { useEffect } from 'react';
import { normalizeDeviceList } from '../lib/deviceData';
import { useAppStore } from '../lib/store';
import type { DeviceTelemetryMessage } from '../types';

const API_URL = import.meta.env.VITE_DEVICE_API_URL as string | undefined;
const API_TOKEN = import.meta.env.VITE_DEVICE_API_TOKEN as string | undefined;
const API_POLL_MS = Number(import.meta.env.VITE_DEVICE_API_POLL_MS || 10000);
const MQTT_WS_URL = import.meta.env.VITE_MQTT_WS_URL as string | undefined;

export function useDeviceDataConnection() {
  const setDevices = useAppStore((state) => state.setDevices);
  const applyTelemetryMessage = useAppStore((state) => state.applyTelemetryMessage);
  const setDeviceDataSourceStatus = useAppStore((state) => state.setDeviceDataSourceStatus);

  useEffect(() => {
    if (!API_URL) return;

    let cancelled = false;

    const fetchDevices = async () => {
      try {
        const response = await fetch(API_URL, {
          headers: API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : undefined,
        });

        if (!response.ok) {
          throw new Error(`Device API request failed: ${response.status}`);
        }

        const payload = await response.json();
        const devices = normalizeDeviceList(payload);

        if (!cancelled && devices.length > 0) {
          setDevices(devices, 'api');
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setDeviceDataSourceStatus('error');
        }
      }
    };

    fetchDevices();
    const intervalId = window.setInterval(fetchDevices, Number.isFinite(API_POLL_MS) ? API_POLL_MS : 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [setDeviceDataSourceStatus, setDevices]);

  useEffect(() => {
    if (!MQTT_WS_URL) return;

    let socket: WebSocket | null = new WebSocket(MQTT_WS_URL);

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as DeviceTelemetryMessage;
        applyTelemetryMessage(payload, 'mqtt');
      } catch (error) {
        console.error('Failed to parse MQTT bridge payload', error);
      }
    };

    socket.onerror = () => {
      setDeviceDataSourceStatus('error');
    };

    socket.onclose = () => {
      socket = null;
    };

    return () => {
      socket?.close();
      socket = null;
    };
  }, [applyTelemetryMessage, setDeviceDataSourceStatus]);
}
