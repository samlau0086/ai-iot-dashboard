import type { Alert, AlertLevel, Device } from '../types';

const trendTimes = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
const loadProfile = [0.42, 0.38, 0.78, 1, 0.92, 0.56];
const baselineProfile = [0.4, 0.39, 0.72, 0.95, 0.9, 0.52];

const numberMetric = (device: Device, metric: string) => {
  const value = Number(device.metrics?.[metric]);
  return Number.isFinite(value) ? value : 0;
};

const hasMetric = (device: Device, metric: string) => Number.isFinite(Number(device.metrics?.[metric]));

const pushAlert = (
  alerts: Alert[],
  device: Device,
  level: AlertLevel,
  status: Alert['status'],
  message: string,
  suffix: string
) => {
  alerts.push({
    id: `ALERT-${device.id}-${suffix}`,
    deviceId: device.id,
    deviceName: device.name,
    level,
    message,
    timestamp: device.lastSeen || new Date().toISOString(),
    status,
  });
};

export const deriveAlertsFromDevices = (devices: Device[]): Alert[] => {
  const alerts: Alert[] = [];

  devices.forEach((device) => {
    const metrics = device.metrics || {};
    const temperature = numberMetric(device, 'temperature') || numberMetric(device, 'motor_temp') || numberMetric(device, 'oil_temp');
    const power = numberMetric(device, 'power') || numberMetric(device, 'pv_power');
    const pressure = numberMetric(device, 'pressure');
    const leakageRate = numberMetric(device, 'leakage_rate');
    const battery = numberMetric(device, 'battery') || numberMetric(device, 'battery_soc');
    const runningHours = numberMetric(device, 'running_hours') || numberMetric(device, 'runtime_hours');
    const doorOpenEvents = numberMetric(device, 'door_open_events') || numberMetric(device, 'door_open_count');

    if (device.status === 'offline') {
      pushAlert(alerts, device, 'Critical', 'active', 'Device is offline and has stopped reporting telemetry.', 'offline');
    }

    if (device.status === 'warning') {
      pushAlert(alerts, device, 'Warning', 'active', 'Device reports warning status from the latest telemetry payload.', 'status-warning');
    }

    if (device.type === 'temperature_sensor' && hasMetric(device, 'temperature') && temperature > -15) {
      pushAlert(alerts, device, 'Critical', 'active', `Cold storage temperature is ${temperature.toFixed(1)} deg C, above the -15 deg C threshold.`, 'cold-temperature');
    } else if (temperature >= 80) {
      pushAlert(alerts, device, 'Warning', 'active', `Equipment temperature is ${temperature.toFixed(1)} deg C and should be inspected.`, 'high-temperature');
    }

    if (power >= 15000 && (device.type === 'energy_meter' || device.type === 'air_compressor')) {
      pushAlert(alerts, device, 'Warning', 'active', `Power draw is ${power.toFixed(0)} W, above the configured operating threshold.`, 'high-power');
    }

    if (pressure >= 8) {
      pushAlert(alerts, device, 'Warning', 'active', `Pressure is ${pressure.toFixed(1)} bar, above the normal operating range.`, 'high-pressure');
    } else if (pressure > 0 && pressure < 2) {
      pushAlert(alerts, device, 'Warning', 'active', `Pressure is ${pressure.toFixed(1)} bar, below the normal operating range.`, 'low-pressure');
    }

    if (leakageRate > 2) {
      pushAlert(alerts, device, 'Warning', 'active', `Air leakage rate is ${leakageRate.toFixed(1)}%, above the expected threshold.`, 'leakage');
    }

    if (battery > 0 && battery < 20) {
      pushAlert(alerts, device, 'Warning', 'active', `Battery level is ${battery.toFixed(0)}%, replacement or charging is recommended.`, 'low-battery');
    }

    if (doorOpenEvents > 5) {
      pushAlert(alerts, device, 'Warning', 'acknowledged', `Door open events reached ${doorOpenEvents.toFixed(0)} today.`, 'door-events');
    }

    if (runningHours >= 1000 && metrics.running_hours !== undefined) {
      pushAlert(alerts, device, 'Info', 'active', `Routine maintenance recommended after ${runningHours.toFixed(0)} running hours.`, 'maintenance');
    }
  });

  return alerts.sort((first, second) => new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime());
};

export const deriveEnergyTrendData = (devices: Device[], metric = 'power') => {
  const totalMetric = devices.reduce((sum, device) => sum + numberMetric(device, metric), 0);
  const fallbackEnergy = devices.reduce((sum, device) => sum + numberMetric(device, 'energy') || numberMetric(device, 'energy_today'), 0);
  const baseValue = totalMetric || fallbackEnergy || 0;

  return trendTimes.map((time, index) => ({
    time,
    value: Number((baseValue * loadProfile[index]).toFixed(1)),
    baseline: Number((baseValue * baselineProfile[index]).toFixed(1)),
  }));
};
