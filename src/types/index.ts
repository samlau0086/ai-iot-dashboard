export type DeviceType =
  | 'energy_meter'
  | 'plc'
  | 'temperature_sensor'
  | 'solar_inverter'
  | 'pump_controller'
  | 'air_compressor'
  | 'gateway'
  | 'dtu'
  | 'rtu'
  | 'lora_gateway'
  | 'io_module'
  | 'relay_module'
  | 'valve_controller'
  | 'vfd'
  | 'hmi'
  | 'industrial_pc'
  | 'robot'
  | 'camera'
  | 'ups'
  | 'battery_bms'
  | 'weather_station'
  | 'flow_meter'
  | 'pressure_sensor'
  | 'level_sensor'
  | 'vibration_sensor'
  | 'sensor';

export interface DeviceConfig {
  externalDeviceId?: string;
  dataSource?: 'api' | 'mqtt' | 'manual';
  apiPath?: string;
  mqttTopic?: string;
  commandTopic?: string;
  mqttCommandTopic?: string;
  metricMapping?: Record<string, string>;
  controlState?: Record<string, unknown>;
  controlDefinitions?: Array<{
    id: string;
    label: string;
    description: string;
    iconId?: string;
    valueType: 'none' | 'toggle' | 'select' | 'slider' | 'range' | 'number' | 'text' | 'parameter_group';
    parameterKey?: string;
    defaultValue?: string | number | boolean;
    toggleOnValue?: string | number | boolean;
    toggleOffValue?: string | number | boolean;
    options?: Array<{ value: string; label: string }>;
    fields?: Array<{ key: string; label: string; valueType: 'text' | 'number' | 'select'; defaultValue?: string | number | boolean; options?: Array<{ value: string; label: string }>; unit?: string }>;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
  }>;
  mqttReceiveTemplate?: string;
  mqttCommandTemplate?: string;
  scadaOfflineDetectionEnabled?: boolean;
  scadaOfflineTimeoutSeconds?: number;

  // Industrial protocol / edge gateway binding
  protocol?: string;
  transportMode?: string;
  serialPort?: string;
  host?: string;
  registerMap?: string;
  canChannel?: string;
  bitrate?: number;
  devEui?: string;
  apn?: string;
  imei?: string;
  ssid?: string;
  serverAddress?: string;
  port?: number;

  // DTU
  baudRate?: number;
  
  // RTU
  pollingInterval?: number;
  slaveId?: number;
  
  // Gateway
  ipAddress?: string;
  subnet?: string;
  
  // LoRa Gateway
  frequencyPlan?: string;
  spreadingFactor?: string;
  
  // Sensor
  unit?: string;
  measurementType?: string;
}

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  siteId?: string;
  tenantId?: string;
  tags: string[];
  metrics: Record<string, number>;
  status: 'online' | 'offline' | 'warning';
  lastSeen: string;
  firmwareVersion: string;
  icon?: string;
  scadaIcon?: {
    mode: 'auto' | 'preset' | 'svg';
    iconId?: string;
    svg?: string;
    fileName?: string;
  };
  config?: DeviceConfig;
}

export interface DeviceTelemetryMessage {
  device_id?: string;
  deviceId?: string;
  id?: string;
  name?: string;
  device_type?: DeviceType;
  type?: DeviceType;
  site_id?: string;
  siteId?: string;
  tenant_id?: string;
  tenantId?: string;
  tags?: string[];
  metrics?: Record<string, number>;
  status?: 'online' | 'offline' | 'warning';
  timestamp?: string;
  lastSeen?: string;
  firmwareVersion?: string;
}

export type AlertLevel = 'Info' | 'Warning' | 'Critical' | 'Emergency';

export interface Alert {
  id: string;
  deviceId: string;
  deviceName: string;
  level: AlertLevel;
  message: string;
  timestamp: string;
  status: 'active' | 'acknowledged' | 'resolved';
}
