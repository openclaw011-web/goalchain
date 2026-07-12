'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { PoolDistribution } from '@/lib/types';

interface PoolDistributionProps {
  data: PoolDistribution[];
  totalPool?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload as PoolDistribution;
  return (
    <div className="glass-card p-3 shadow-xl border-goalchain-border-light">
      <p className="text-sm font-medium mb-1">{item.outcome}</p>
      <p className="text-sm text-goalchain-text-muted">
        <span className="font-mono text-white">{item.percentage.toFixed(1)}%</span> of pool
      </p>
      <p className="text-xs text-goalchain-text-muted">
        ${item.amount.toLocaleString()} USDC
      </p>
    </div>
  );
}

export default function PoolDistributionComponent({ data, totalPool }: PoolDistributionProps) {
  if (!data || data.length === 0) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4">Pool Distribution</h3>
        <div className="h-[200px] flex items-center justify-center text-goalchain-text-muted text-sm">
          No pool data available
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Pool Distribution</h3>
        {totalPool && (
          <span className="text-sm text-goalchain-text-muted">
            Total: <span className="font-mono text-white">${totalPool.toLocaleString()}</span>
          </span>
        )}
      </div>

      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2440" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#1e2440' }}
              tickFormatter={(val: number) => `${val}%`}
              domain={[0, 100]}
            />
            <YAxis
              type="category"
              dataKey="outcome"
              tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
              width={90}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="percentage" radius={[0, 4, 4, 0]} barSize={24}>
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.color || '#00ff88'} fillOpacity={0.7} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-goalchain-border">
        {data.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-goalchain-text-muted">{item.outcome}</span>
            <span className="text-xs font-mono text-white">{item.percentage.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
