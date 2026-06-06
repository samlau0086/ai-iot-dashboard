import { useEffect } from 'react';
import { normalizeDeviceList } from '../lib/deviceData';
import { useAppStore } from '../lib/store';
import type { DeviceTelemetryMessage } from '../types';

const API_URL = import.meta.env.VITE_DEVICE_API_URL as string | undefined;
const API_TOKEN = import.meta.env.VITE_DEVICE_API_TOKEN as string | undefined;
const API_POLL_MS = Number(import.meta.env.VITE_DEVICE_API_POLL_MS || 10000);

export function useDeviceDataConnection() {
  const currentUser = useAppStore((state) => state.currentUser);
  const userSettings = useAppStore((state) => (
    currentUser ? state.deviceDataSettingsByUser[currentUser.id] : undefined
  ));
  const setDevices = useAppStore((state) => state.setDevices);
  const applyTelemetryMessage = useAppStore((state) => state.applyTelemetryMessage);
  const setDeviceDataSourceStatus = useAppStore((state) => state.setDeviceDataSourceStatus);
  const apiUrl = userSettings?.apiUrl.trim() || API_URL;
  const apiToken = userSettings?.apiToken || API_TOKEN;
  const apiPollMs = Number(userSettings?.apiPollMs || API_POLL_MS || 10000);
  const mqttWsUrl = userSettings?.mqttWsUrl.trim();
  const mqttEnabled = Boolean(userSettings?.mqttEnabled && mqttWsUrl);

  useEffect(() => {
    if (!apiUrl) return;

    let cancelled = false;

    const fetchDevices = async () => {
      try {
        const response = await fetch(apiUrl, {
          headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : undefined,
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
    const intervalId = window.setInterval(fetchDevices, Number.isFinite(apiPollMs) ? apiPollMs : 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [apiPollMs, apiToken, apiUrl, setDeviceDataSourceStatus, setDevices]);

  useEffect(() => {
    if (!mqttEnabled || !mqttWsUrl) return;

    let socket: WebSocket | null = new WebSocket(mqttWsUrl);

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
  }, [applyTelemetryMessage, mqttEnabled, mqttWsUrl, setDeviceDataSourceStatus]);
}
