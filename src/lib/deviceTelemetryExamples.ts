import type { Device, DeviceType } from '../types';

export const sampleMetricsByType = (type?: DeviceType) => {
  switch (type) {
    case 'energy_meter':
      return { power: 4070, energy: 128.6, voltage: 380, current: 10.7 };
    case 'temperature_sensor':
    case 'sensor':
      return { temperature: -18.4, humidity: 62, battery: 85 };
    case 'air_compressor':
      return { pressure: 7.8, air_flow: 520, oil_temp: 76, leakage_rate: 1.8, power: 22000 };
    case 'solar_inverter':
      return { pv_power: 52.6, energy_today: 318.4, dc_voltage: 720, efficiency: 97.2 };
    case 'pump_controller':
      return { flow_rate: 68.5, pressure: 4.2, motor_temp: 58.3, runtime_hours: 1260 };
    case 'gateway':
      return { cpu: 45, ram: 60, uptime: 720 };
    case 'dtu':
    case 'rtu':
    case 'lora_gateway':
      return { voltage: 24, signal: 82, packet_loss: 0.2 };
    case 'plc':
      return { io_rate: 128, cycle_time: 12, cpu: 38 };
    case 'io_module':
      return { di_on: 8, do_on: 4, ai_value: 12.6, ao_value: 4.2, voltage: 24 };
    case 'relay_module':
      return { relay_on: 6, switching_count: 1280, coil_voltage: 24 };
    case 'valve_controller':
      return { position: 72, command_position: 75, pressure: 3.8, cycles: 4200 };
    case 'vfd':
      return { frequency: 42.5, motor_speed: 1450, current: 18.2, fault_code: 0 };
    case 'hmi':
    case 'industrial_pc':
      return { cpu: 36, ram: 58, disk: 71, uptime: 960 };
    case 'robot':
      return { cycle_time: 38, utilization: 82, error_count: 0, axis_load: 64 };
    case 'camera':
      return { online_streams: 1, fps: 25, bitrate: 4.8, storage: 62 };
    case 'ups':
    case 'battery_bms':
      return { battery_soc: 92, voltage: 48, temperature: 32, health: 98 };
    case 'weather_station':
      return { temperature: 28, humidity: 68, wind_speed: 4.2, rainfall: 0 };
    case 'flow_meter':
      return { flow_rate: 128, total_flow: 8420, temperature: 24 };
    case 'pressure_sensor':
      return { pressure: 4.6, temperature: 31, battery: 88 };
    case 'level_sensor':
      return { level: 76, volume: 1240, battery: 91 };
    case 'vibration_sensor':
      return { vibration: 2.4, velocity: 1.1, bearing_temp: 52, battery: 87 };
    default:
      return { value: 1 };
  }
};

export const getDeviceExternalId = (device?: Pick<Device, 'id' | 'config'> | null, fallbackId = 'NEW-DEVICE-ID') => (
  String(device?.config?.externalDeviceId || device?.id || fallbackId).trim() || fallbackId
);

export const getMqttTelemetryTopic = (device?: Pick<Device, 'id' | 'config'> | null, fallbackId = 'NEW-DEVICE-ID') => {
  const externalDeviceId = getDeviceExternalId(device, fallbackId);
  return String(device?.config?.mqttTopic || '').trim() || `devices/${externalDeviceId}/telemetry`;
};

export const getTelemetryEndpoint = (device?: Pick<Device, 'config'> | null, origin = 'http://localhost:3006') => {
  const apiPath = String(device?.config?.apiPath || '').trim();
  if (apiPath) {
    if (apiPath.startsWith('http')) return apiPath;
    return `${origin}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;
  }
  return `${origin}/api/telemetry`;
};

export const buildTelemetryPayload = (device?: Device | null) => {
  const externalDeviceId = getDeviceExternalId(device);
  const deviceType = (device?.type || 'gateway') as DeviceType;
  const isMqtt = device?.config?.dataSource === 'mqtt';

  return {
    device_id: externalDeviceId,
    device_type: deviceType,
    tags: device?.tags || ['factory-a'],
    ...(isMqtt ? { mqtt_topic: getMqttTelemetryTopic(device) } : {}),
    metrics: Object.keys(device?.metrics || {}).length ? (device?.metrics || {}) : sampleMetricsByType(deviceType),
    status: device?.status || 'online',
    timestamp: new Date().toISOString(),
  };
};

export const buildCurlRequest = (device?: Device | null, origin = 'http://localhost:3006') => {
  const payload = JSON.stringify(buildTelemetryPayload(device), null, 2);
  return `curl -X POST "${getTelemetryEndpoint(device, origin)}" \\
  -H "Content-Type: application/json" \\
  -H "x-iot-token: <copy-token-from-settings>" \\
  -d '${payload}'`;
};

export const buildMqttExample = (device?: Device | null) => {
  const payload = JSON.stringify(buildTelemetryPayload(device), null, 2);
  const commandPayload = device?.config?.mqttCommandTemplate || JSON.stringify({
    cmd: '{{command}}',
    device: '{{deviceId}}',
    params: '{{parameters}}',
    ts: '{{timestamp}}',
  }, null, 2);
  const externalDeviceId = getDeviceExternalId(device);
  const topic = getMqttTelemetryTopic(device);

  return `Topic: ${topic}

Payload:
${payload}

Command Topic:
${device?.config?.commandTopic || device?.config?.mqttCommandTopic || `devices/${externalDeviceId}/command`}

Command Payload Template:
${commandPayload}

MQTT CLI:
mqtt pub -h <broker-host> -p 1883 -t "${topic}" -m '${JSON.stringify(buildTelemetryPayload(device))}'`;
};

export const buildTelemetryExample = (device?: Device | null, origin = 'http://localhost:3006') => (
  device?.config?.dataSource === 'mqtt' ? buildMqttExample(device) : buildCurlRequest(device, origin)
);
