import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, CartesianGrid, XAxis, YAxis, Bar, LineChart, Line } from 'recharts';
import { ChartConfig } from '../lib/store';

const COLORS = ['#ea580c', '#3b82f6', '#10b981', '#64748b'];

const mockDataSources: Record<string, any[]> = {
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
  ]
};

export function ChartRenderer({ chartConf, theme }: { chartConf: ChartConfig, theme: string }) {
  const isDark = theme === 'dark';
  const cartesianGridStroke = isDark ? '#334155' : '#e2e8f0';
  const tooltipBg = isDark ? '#0f1115' : '#ffffff';
  const tooltipBorder = isDark ? '#1e293b' : '#e2e8f0';
  const tooltipColor = isDark ? '#cbd5e1' : '#334155';
  const cursorFill = isDark ? '#334155' : '#f8fafc';

  const data = mockDataSources[chartConf.dataSource] || [];
  
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
