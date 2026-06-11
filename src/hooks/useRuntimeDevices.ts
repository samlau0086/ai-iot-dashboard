import { useEffect, useMemo, useState } from 'react';
import type { Device } from '../types';
import { deriveRuntimeDevices } from '../lib/deviceStatus';

const RUNTIME_DEVICE_TICK_MS = 5000;

export const useRuntimeDevices = (devices: Device[]) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), RUNTIME_DEVICE_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  return useMemo(() => deriveRuntimeDevices(devices, now), [devices, now]);
};
