/**
 * Report charts built on Recharts, themed with the portal palette.
 * Each chart exposes a text summary through aria-label; pages pair charts
 * with a DataTable so the same numbers are available without the graphic.
 */
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./charts.css";

export const CHART_COLORS = {
  teal: "#1d8c8c",
  violet: "#7c5cd6",
  blue: "#3b82d6",
  amber: "#e5a21a",
  rose: "#d9534f",
  green: "#2f9e6e",
  slate: "#8a9bb3",
} as const;
export const PALETTE = [CHART_COLORS.teal, CHART_COLORS.violet, CHART_COLORS.blue, CHART_COLORS.amber, CHART_COLORS.green, CHART_COLORS.rose, CHART_COLORS.slate];

const axisStyle = { fontSize: 11, fill: "#607392", fontFamily: "Inter, sans-serif" };

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string; color?: string }>; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ch-tooltip" role="status">
      {label && <strong>{label}</strong>}
      {payload.map((item) => (
        <span key={String(item.name)}>
          <i style={{ background: item.color }} aria-hidden="true" />
          {item.name}: <b>{item.value}{unit ?? ""}</b>
        </span>
      ))}
    </div>
  );
}

export function ChartEmpty({ children = "No data for this period yet." }: { children?: ReactNode }) {
  return <p className="ch-empty">{children}</p>;
}

/** Horizontal ranked bars (pure CSS): the clearest way to compare a handful of categories. */
export function BarList({
  items,
  max,
  suffix = "",
  empty,
}: {
  items: Array<{ label: string; value: number; color?: string; hint?: string }>;
  max?: number;
  suffix?: string;
  empty?: ReactNode;
}) {
  if (!items.length || items.every((item) => item.value === 0) && !max) return <ChartEmpty>{empty}</ChartEmpty>;
  const top = max ?? Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="ch-barlist">
      {items.map((item) => (
        <li key={item.label}>
          <div className="ch-barlist__head">
            <span>{item.label}</span>
            <b>
              {item.value}
              {suffix}
            </b>
          </div>
          <div
            className="ch-barlist__track"
            role="img"
            aria-label={`${item.label}: ${item.value}${suffix}${item.hint ? `, ${item.hint}` : ""}`}
          >
            <span style={{ width: `${Math.min(100, (item.value / top) * 100)}%`, background: item.color ?? CHART_COLORS.teal }} />
          </div>
          {item.hint && <small>{item.hint}</small>}
        </li>
      ))}
    </ul>
  );
}

export function TrendChart({
  data,
  series,
  height = 240,
  xKey = "label",
  summary,
}: {
  data: Array<Record<string, string | number>>;
  series: Array<{ key: string; label: string; color?: string }>;
  height?: number;
  xKey?: string;
  summary: string;
}) {
  if (!data.length) return <ChartEmpty />;
  return (
    <div className="ch-frame" style={{ height }} role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            {series.map((item, index) => (
              <linearGradient key={item.key} id={`ch-grad-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={item.color ?? PALETTE[index]} stopOpacity={0.28} />
                <stop offset="100%" stopColor={item.color ?? PALETTE[index]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#e6edf2" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} tick={axisStyle} tickLine={false} axisLine={{ stroke: "#dbe4ed" }} minTickGap={24} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#405675" }} />}
          {series.map((item, index) => (
            <Area
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={item.color ?? PALETTE[index]}
              strokeWidth={2}
              fill={`url(#ch-grad-${item.key})`}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ColumnChart({
  data,
  series,
  height = 240,
  xKey = "label",
  stacked,
  unit,
  summary,
  yMax,
}: {
  data: Array<Record<string, string | number | null>>;
  series: Array<{ key: string; label: string; color?: string }>;
  height?: number;
  xKey?: string;
  stacked?: boolean;
  unit?: string;
  summary: string;
  yMax?: number;
}) {
  if (!data.length) return <ChartEmpty />;
  return (
    <div className="ch-frame" style={{ height }} role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap="22%">
          <CartesianGrid stroke="#e6edf2" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} tick={axisStyle} tickLine={false} axisLine={{ stroke: "#dbe4ed" }} interval={0} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} domain={yMax ? [0, yMax] : undefined} />
          <Tooltip cursor={{ fill: "rgba(29,140,140,0.06)" }} content={<ChartTooltip unit={unit} />} />
          {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#405675" }} />}
          {series.map((item, index) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              name={item.label}
              fill={item.color ?? PALETTE[index]}
              stackId={stacked ? "stack" : undefined}
              radius={stacked ? 0 : [5, 5, 0, 0]}
              maxBarSize={44}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({
  data,
  centerValue,
  centerLabel,
  height = 220,
  summary,
}: {
  data: Array<{ name: string; value: number; color?: string }>;
  centerValue?: ReactNode;
  centerLabel?: string;
  height?: number;
  summary: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!total) return <ChartEmpty />;
  return (
    <div className="ch-donut" role="img" aria-label={summary}>
      <div className="ch-donut__plot" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={2} stroke="none" isAnimationActive={false}>
              {data.map((item, index) => (
                <Cell key={item.name} fill={item.color ?? PALETTE[index % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="ch-donut__center" aria-hidden="true">
          <strong>{centerValue ?? total}</strong>
          {centerLabel && <span>{centerLabel}</span>}
        </div>
      </div>
      <ul className="ch-legend">
        {data.map((item, index) => (
          <li key={item.name}>
            <i style={{ background: item.color ?? PALETTE[index % PALETTE.length] }} aria-hidden="true" />
            <span>{item.name}</span>
            <b>{item.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A single percentage as a ring, with the numerator/denominator beneath. */
export function RateRing({ rate, label, detail, color = CHART_COLORS.teal }: { rate: number | null; label: string; detail?: string; color?: string }) {
  const value = rate ?? 0;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="ch-ring" role="img" aria-label={`${label}: ${rate === null ? "not enough data" : `${rate}%`}${detail ? `, ${detail}` : ""}`}>
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="#e6edf2" strokeWidth="8" />
        {rate !== null && (
          <circle
            cx="40" cy="40" r={radius} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${(value / 100) * circumference} ${circumference}`} transform="rotate(-90 40 40)"
          />
        )}
        <text x="40" y="45" textAnchor="middle">{rate === null ? "—" : `${Math.round(value)}%`}</text>
      </svg>
      <div>
        <strong>{label}</strong>
        {detail && <span>{detail}</span>}
      </div>
    </div>
  );
}
