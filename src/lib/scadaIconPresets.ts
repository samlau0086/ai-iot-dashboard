export interface ScadaIconPreset {
  id: string;
  name: string;
  url: string;
}

const iconFiles = [
  'air-compressor.svg',
  'alarm.svg',
  'alarm-clock-alt.svg',
  'alarm-on.svg',
  'battery-level-interface-symbol.svg',
  'compressor.svg',
  'door-handle.svg',
  'door-lock.svg',
  'electric-current-symbol.svg',
  'electricity-signal.svg',
  'engine-motor.svg',
  'gauge-meter.svg',
  'htc-mobile-phone.svg',
  'light.svg',
  'light-bulb.svg',
  'lock-closed.svg',
  'lock-password.svg',
  'lock-password-unlocked.svg',
  'low-battery.svg',
  'meter-4.svg',
  'meter-free-5.svg',
  'mobile-data.svg',
  'mobile-signal.svg',
  'motor-alt.svg',
  'motor-controller.svg',
  'nfc.svg',
  'oil-valve.svg',
  'ph-meter-lab.svg',
  'pressure-technology.svg',
  'radar.svg',
  'radar-2.svg',
  'radar-2-c8ft5.svg',
  'radar-2-jdirk.svg',
  'radar-2-n2ye8.svg',
  'radar-2-tkv7w.svg',
  'rain-drops.svg',
  'router.svg',
  'router-1tf5q.svg',
  'router-modem.svg',
  'router-one.svg',
  'router-security.svg',
  'solar-energy.svg',
  'solar-panel-in-sunlight.svg',
  'solar-power-plant-clean-energy-solar-farm-solar-enrgy.svg',
  'solar-roof-clean-energy-solar-panel-alternative-energy.svg',
  'speedometer.svg',
  'terminal-linux.svg',
  'truck.svg',
  'turnstiles-and-door.svg',
  'valve.svg',
  'valve-4f7ex.svg',
  'voltmeter-energy.svg',
  'water-pump-outline.svg',
  'water-pump-outline-rounded.svg',
  'wifi-controller.svg',
  'wind-energy.svg',
  'wind-power.svg',
  'wind-power-1.svg',
  'wind-power-2.svg',
  'wireless-internet-smartphone.svg',
];

const labelFromFile = (file: string) => file
  .replace(/\.svg$/i, '')
  .replace(/\s*\(\d+\)/g, '')
  .replace(/-?svgrepo-?com/gi, '')
  .replace(/-/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, (char) => char.toUpperCase());

export const scadaIconPresets: ScadaIconPreset[] = iconFiles.map((file) => ({
  id: file.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  name: labelFromFile(file),
  url: `/scada-icons/${encodeURIComponent(file)}`,
}));
