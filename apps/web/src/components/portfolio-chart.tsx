'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { PortfolioHistoryPoint } from '@/lib/api';

interface PortfolioChartProps {
  data: PortfolioHistoryPoint[];
  height?: number;
  showGrid?: boolean;
  strokeColor?: string;
}

interface ChartDataPoint {
  date: string;
  value: number;
  formattedDate: string;
  formattedValue: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatChartDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as ChartDataPoint;
    return (
      <div className="rounded-lg border border-foreground/20 bg-background/95 p-3 shadow-lg backdrop-blur-sm">
        <p className="text-sm font-medium text-foreground">
          {new Date(data.date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
        <p className="text-lg font-semibold text-blue-500">
          {data.formattedValue}
        </p>
      </div>
    );
  }
  return null;
}

export function PortfolioChart({
  data,
  height = 300,
  showGrid = true,
  strokeColor = '#3b82f6',
}: PortfolioChartProps) {
  // Transform data for Recharts
  const chartData: ChartDataPoint[] = data.map((point) => {
    const value = parseFloat(point.value);
    return {
      date: point.date,
      value,
      formattedDate: formatChartDate(point.date),
      formattedValue: formatCurrency(value),
    };
  });

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-foreground/10 bg-foreground/5"
        style={{ height }}
      >
        <p className="text-foreground/60">No portfolio data available</p>
      </div>
    );
  }

  // Calculate min/max for better Y-axis scaling
  const values = chartData.map((d) => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = (maxValue - minValue) * 0.1; // 10% padding
  const yAxisDomain = [
    Math.max(0, minValue - padding),
    maxValue + padding,
  ];

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              className="opacity-20"
            />
          )}
          <XAxis
            dataKey="formattedDate"
            stroke="currentColor"
            className="text-xs text-foreground/60"
            tick={{ fontSize: 12, fill: 'currentColor' }}
            tickLine={{ stroke: 'currentColor', opacity: 0.3 }}
            axisLine={{ stroke: 'currentColor', opacity: 0.3 }}
          />
          <YAxis
            domain={yAxisDomain}
            stroke="currentColor"
            className="text-xs text-foreground/60"
            tick={{ fontSize: 12, fill: 'currentColor' }}
            tickLine={{ stroke: 'currentColor', opacity: 0.3 }}
            axisLine={{ stroke: 'currentColor', opacity: 0.3 }}
            tickFormatter={formatCurrency}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={2}
            dot={false}
            activeDot={{
              r: 4,
              stroke: strokeColor,
              strokeWidth: 2,
              fill: 'white',
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}