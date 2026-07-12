'use client';

import { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { OddsPoint } from '@/lib/types';
import { format, parseISO } from 'date-fns';

interface OddsChartProps {
  data: OddsPoint[];
  labels: string[];
  colors?: string[];
}

const DEFAULT_COLORS = ['#00ff88', '#f59e0b', '#3b82f6'];

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  labels: string[];
}

function CustomTooltip({ active, payload, label, labels }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="glass-card p-3 shadow-xl border-goalchain-border-light">
      <p className="text-xs text-goalchain-text-muted mb-2">
        {label ? format(parseISO(label), 'MMM d, HH:mm') : ''}
      </p>
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-goalchain-text-muted">{labels[idx]}:</span>
          <span className="font-mono font-medium text-white">{Number(entry.value).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

export default function OddsChart({ data, labels, colors = DEFAULT_COLORS }: OddsChartProps) {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | 'all'>('24h');

  if (!data || data.length === 0) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4">Odds Movement</h3>
        <div className="h-[300px] flex items-center justify-center text-goalchain-text-muted text-sm">
          No odds data available yet
        </div>
      </div>
    );
  }

  // Transform data for recharts
  const chartData = data.map((point) => {
    const entry: any = { timestamp: point.timestamp };
    point.odds.forEach((odd, idx) => {
      entry[labels[idx] || `outcome_${idx}`] = odd;
    });
    return entry;
  });

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Odds Movement</h3>
        <div className="flex gap-1 bg-goalchain-navy-light rounded-lg p-0.5">
          {(['24h', '7d', 'all'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                timeRange === range
                  ? 'bg-goalchain-green/20 text-goalchain-green font-medium'
                  : 'text-goalchain-text-muted hover:text-white'
              }`}
            >
              {range === '24h' ? '24H' : range === '7d' ? '7D' : 'ALL'}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2440" vertical={false} />
            <XAxis
              dataKey="timestamp"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#1e2440' }}
              tickFormatter={(val) => {
                try {
                  return format(parseISO(val), 'MMM d');
                } catch {
                  return '';
                }
              }}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val: number) => val.toFixed(1)}
            />
            <Tooltip content={<CustomTooltip labels={labels} />} />
            <Legend
              wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }}
              iconType="circle"
            />
            {labels.map((label, idx) => (
              <Line
                key={label}
                type="monotone"
                dataKey={label}
                stroke={colors[idx] || DEFAULT_COLORS[idx]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, fill: '#0a0e1a' }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
