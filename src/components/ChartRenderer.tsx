import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, CartesianGrid, XAxis, YAxis, Bar, LineChart, Line } from 'recharts';
import { ChartConfig } from '../lib/store';
import type { Device } from '../types';

const COLORS = ['#ea580c', '#3b82f6', '#10b981', '#64748b'];

const chartProfiles: Record<string, any[]> = {
  energy: [
    { name: 'Mon', A: 4000, B: 2400 },
    { name: 'Tue', A: 3000, B: 1398 },
    { name: 'Wed', A: 2000, B: 4800 },
    { name: 'Thu', A: 2780, B: 3908 },
    { name: 'Fri', A: 1890, B: 4800 },
  ],
  devices: [
    { name: 'Active', value: 45 },
    { name: 'Offline', value: 10 },
    { name: 'Warning', value: 15 },
  ],
  alerts: [
    { name: 'Week 1', A: 12 },
    { name: 'Week 2', A: 5 },
    { name: 'Week 3', A: 15 },
    { name: 'Week 4', A: 8 },
  ],
  solar: [
    { name: '06:00', A: 120 },
    { name: '09:00', A: 640 },
    { name: '12:00', A: 1180 },
    { name: '15:00', A: 920 },
    { name: '18:00', A: 180 },
  ],
  coldStorage: [
    { name: '00:00', A: -18.1 },
    { name: '06:00', A: -18.6 },
    { name: '12:00', A: -17.9 },
    { name: '18:00', A: -18.4 },
    { name: '24:00', A: -18.2 },
  ],
  waterPump: [
    { name: '00:00', A: 4.2 },
    { name: '06:00', A: 4.8 },
    { name: '12:00', A: 4.5 },
    { name: '18:00', A: 4.9 },
    { name: '24:00', A: 4.6 },
  ],
  airCompressor: [
    { name: '00:00', A: 7.4 },
    { name: '06:00', A: 7.9 },
    { name: '12:00', A: 7.6 },
    { name: '18:00', A: 8.1 },
    { name: '24:00', A: 7.8 },
  ]
};

const sumMetric = (devices: Device[], metric: string) => devices.reduce((total, device) => total + (Number(device.metrics?.[metric]) || 0), 0);
const averageMetric = (devices: Device[], metric: string) => {
  const values = devices.map((device) => Number(device.metrics?.[metric])).filter((value) => Number.isFinite(value));
  if (values.length === 0) return 0;

  return values.reduce((total, value) => total + value, 0) / values.length;
};

const getDeviceDrivenData = (chartConf: ChartConfig, devices?: Device[]) => {
  const fallbackData = chartProfiles[chartConf.dataSource] || [];
  if (!devices || devices.length === 0) return fallbackData;
  const boundMetric = chartConf.metricKey;

  if (boundMetric) {
    const deviceMetricData = devices
      .map((device) => {
        const value = Number(device.metrics?.[boundMetric]) || 0;
        return { name: device.name, value, A: value };
      })
      .filter((item) => item.value !== 0);

    if (chartConf.type === 'pie' || chartConf.type === 'bar') {
      return deviceMetricData.length ? deviceMetricData : [{ name: boundMetric, value: 0, A: 0 }];
    }

    const totalValue = deviceMetricData.reduce((total, item) => total + item.value, 0);
    const factor = Math.max(totalValue / 600, 0.2);
    return fallbackData.map((item) => ({
      ...item,
      A: Number((item.A * factor).toFixed(1)),
    }));
  }

  if (chartConf.dataSource === 'devices') {
    return [
      { name: 'Active', value: devices.filter((device) => device.status === 'online').length },
      { name: 'Offline', value: devices.filter((device) => device.status === 'offline').length },
      { name: 'Warning', value: devices.filter((device) => device.status === 'warning').length },
    ];
  }

  if (chartConf.dataSource === 'energy') {
    const metric = boundMetric || 'energy_today';
    const factor = Math.max(sumMetric(devices, metric) / 600, 0.2);
    return fallbackData.map((item) => ({
      ...item,
      A: Math.round(item.A * factor),
      B: Math.round(item.B * factor),
    }));
  }

  const metricBySource: Record<string, string> = {
    solar: 'energy_today',
    coldStorage: 'temperature',
    waterPump: 'pressure',
    airCompressor: 'pressure',
  };
  const metric = boundMetric || metricBySource[chartConf.dataSource];
  if (!metric) return fallbackData;

  const averageValue = averageMetric(devices, metric);
  if (!averageValue) return fallbackData;

  const fallbackAverage = averageMetric(fallbackData.map((item) => ({ metrics: { [metric]: item.A } } as Device)), metric) || 1;
  const factor = averageValue / fallbackAverage;

  return fallbackData.map((item) => ({
    ...item,
    A: Number((item.A * factor).toFixed(1)),
  }));
};

export function ChartRenderer({ chartConf, theme, devices }: { chartConf: ChartConfig, theme: string, devices?: Device[] }) {
  const isDark = theme === 'dark';
  const cartesianGridStroke = isDark ? '#334155' : '#e2e8f0';
  const tooltipBg = isDark ? '#0f1115' : '#ffffff';
  const tooltipBorder = isDark ? '#1e293b' : '#e2e8f0';
  const tooltipColor = isDark ? '#cbd5e1' : '#334155';
  const cursorFill = isDark ? '#334155' : '#f8fafc';

  const data = getDeviceDrivenData(chartConf, devices);
  
  if (chartConf.type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={100} fill="#8884d8" paddingAngle={2} dataKey="value">
            {data.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: '8px', border: `1px solid ${tooltipBorder}`, backgroundColor: tooltipBg, color: tooltipColor }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartConf.type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cartesianGridStroke} />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontFamily: 'monospace'}} />
          <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontFamily: 'monospace'}} />
          <Tooltip contentStyle={{ borderRadius: '8px', border: `1px solid ${tooltipBorder}`, backgroundColor: tooltipBg, color: tooltipColor }} cursor={{fill: cursorFill, opacity: isDark ? 0.2 : 0.8}} />
          <Bar dataKey="A" fill="#ea580c" />
          <Bar dataKey="B" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartConf.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cartesianGridStroke} />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontFamily: 'monospace'}} />
          <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontFamily: 'monospace'}} />
          <Tooltip contentStyle={{ borderRadius: '8px', border: `1px solid ${tooltipBorder}`, backgroundColor: tooltipBg, color: tooltipColor }} />
          <Line type="monotone" dataKey="A" stroke="#ea580c" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  
  return null;
}
