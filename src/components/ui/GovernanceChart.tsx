import { memo, useMemo, useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const EXPORT_LOADING_DELAY = 300;

import {
  ResponsiveContainer,
  AreaChart as RechartsAreaChart, Area,
  BarChart as RechartsBarChart, Bar,
  PieChart as RechartsPieChart, Pie, Cell,
  RadarChart as RechartsRadarChart, Radar,
  LineChart as RechartsLineChart, Line,
  ComposedChart as RechartsComposedChart,
  RadialBarChart as RechartsRadialBarChart, RadialBar,
  FunnelChart as RechartsFunnelChart, Funnel,
  Treemap as RechartsTreemap,
  ScatterChart as RechartsScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Legend, ZAxis, ReferenceLine,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { Download, Loader2, Layers, BarChart3 } from 'lucide-react';
import Skeleton from './Skeleton';
import { GOVERNANCE_PALETTES } from '../../lib/chartColors';
import GovernanceChartTooltip from './GovernanceChartTooltip';
import type { GovernanceChartProps, GovernanceContext } from '../../types/ui';

type ChartEntry = {
  name?: string;
  value?: number;
  color?: string;
  count?: number;
  [key: string]: string | number | boolean | undefined;
};

function toDrillValue(v: string | number | boolean | undefined): string | number {
  return typeof v === 'number' ? v : v === undefined ? '' : String(v);
}

function isMatch(entry: ChartEntry, filter: { key: string; value: string } | null): boolean {
  if (!filter) return true;
  const v = entry[filter.key];
  return v !== undefined && String(v) === filter.value;
}

function getGovernanceColors(ctx: GovernanceContext) {
  return GOVERNANCE_PALETTES[ctx] || GOVERNANCE_PALETTES.general;
}

function getColorForEntry(entry: ChartEntry, idx: number, configColors: string[] | undefined, palette: readonly string[]): string {
  if (entry.color) return entry.color;
  if (configColors && configColors[idx]) return configColors[idx % configColors.length];
  return palette[idx % palette.length];
}

function getCSVExport(data: ChartEntry[], config: GovernanceChartProps['config'], type: string): string {
  if (!data || data.length === 0) return '';
  const headers: string[] = [config.xKey];
  if (type === 'pie' || type === 'donut' || type === 'funnel' || type === 'treemap') {
    headers.push(config.nameKey || 'name', config.valueKey || 'value');
  } else if (config.yKeys) {
    config.yKeys.forEach(yk => headers.push(yk.name || yk.key));
    config.y2Keys?.forEach(yk => headers.push(yk.name || yk.key));
  } else if (config.valueKey) {
    headers.push(config.valueKey);
  }
  const rows = data.map(entry => {
    return headers.map(h => String(entry[h] ?? entry[h.toLowerCase()] ?? ''));
  });
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

function triggerDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function computeDonutTotal(data: ChartEntry[], config: GovernanceChartProps['config']): number {
  const key = config.valueKey || 'value';
  return data.reduce((s, e) => s + (Number(e[key]) || 0), 0);
}

interface TreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  index?: number;
  name?: string;
  payload?: ChartEntry;
  colors?: readonly string[];
  valueKey?: string;
  isFiltered?: boolean;
  isMatch?: (entry: ChartEntry) => boolean;
  cursorClass?: string;
  formatValue?: (v: number) => string;
  onClick?: (entry: ChartEntry) => void;
}

function TreemapContent(props: TreemapContentProps) {
  const { x = 0, y = 0, width = 0, height = 0, depth, index = 0, name } = props;
  const entry: ChartEntry | undefined = props.payload && typeof props.payload === 'object' ? props.payload : (props as unknown as ChartEntry);
  const color = entry?.color || (props.colors?.[index % props.colors.length]) || '#3b82f6';
  const opacity = props.isFiltered && entry ? (props.isMatch?.(entry) ? 1 : 0.2) : 1;
  const value = entry ? Number(entry[props.valueKey || 'value'] ?? 0) : 0;
  const showLabel = width > 46 && height > 22;
  return (
    <g className={props.cursorClass} onClick={() => entry && props.onClick?.(entry)}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{ fill: color, fillOpacity: opacity, stroke: '#fff', strokeWidth: Math.min(2, width / 20), cursor: props.cursorClass ? 'pointer' : undefined }}
        rx={4}
      />
      {showLabel && (
        <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={Math.min(12, Math.max(8, width / 12))} fontWeight={600} pointerEvents="none">
          {name}
          {value > 0 ? ` · ${props.formatValue ? props.formatValue(value) : value}` : ''}
        </text>
      )}
      {depth && depth >= 1 && showLabel && <line x1={x} y1={y} x2={x} y2={y + height} stroke="#fff" strokeWidth={1} />}
    </g>
  );
}

function GovernanceChart({
  type, data, config, title, subtitle,
  governanceContext = 'general', height = 192,
  className = '', isLoading, isEmpty, emptyMessage = 'No data available',
  onDrillDown, onCrossFilter, crossFilter,
  exportable = true, animated = true,
  periodOptions, periodValue, onPeriodChange,
  valueFormatter, xTickFormatter,
}: GovernanceChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const palette = getGovernanceColors(governanceContext);
  const isFiltered = crossFilter !== null && crossFilter !== undefined;

  const handleExportCSV = useCallback(() => {
    setIsExporting(true);
    const csv = getCSVExport(data, config, type);
    if (csv) {
      triggerDownload(csv, `${title.replace(/\s+/g, '_').toLowerCase()}_data.csv`);
    }
    setTimeout(() => setIsExporting(false), EXPORT_LOADING_DELAY);
  }, [data, config, type, title]);

  const handleBarClick = useCallback((entry: ChartEntry) => {
    if (!onDrillDown && !onCrossFilter) return;
    const xKey = config.xKey || 'name';
    const filter = crossFilter && crossFilter.value === String(entry[xKey]) ? null : { key: xKey, value: String(entry[xKey]) };
    onCrossFilter?.(filter);
    onDrillDown?.({
      label: String(entry[xKey]),
      value: toDrillValue(config.yKeys?.[0] ? entry[config.yKeys[0].key] : entry[config.valueKey || 'value']),
      payload: entry,
    });
  }, [onDrillDown, onCrossFilter, crossFilter, config.xKey, config.yKeys, config.valueKey]);

  const handlePieClick = useCallback((data: ChartEntry) => {
    if (!onDrillDown && !onCrossFilter) return;
    const nameKey = config.nameKey || 'name';
    const entryName = String(data[nameKey]);
    const filter = crossFilter && crossFilter.value === entryName ? null : { key: nameKey, value: entryName };
    onCrossFilter?.(filter);
    onDrillDown?.({
      label: entryName,
      value: toDrillValue(data[config.valueKey || 'value']),
      payload: data,
    });
  }, [onDrillDown, onCrossFilter, crossFilter, config.nameKey, config.valueKey]);

  const handleRadarClick = useCallback((entry: ChartEntry) => {
    if (!onDrillDown && !onCrossFilter) return;
    const xKey = config.xKey || 'name';
    const name = String(entry[xKey]);
    const filter = crossFilter && crossFilter.value === name ? null : { key: xKey, value: name };
    onCrossFilter?.(filter);
    onDrillDown?.({
      label: name,
      value: toDrillValue(config.yKeys?.[0] ? entry[config.yKeys[0].key] : 0),
      payload: entry,
    });
  }, [onDrillDown, onCrossFilter, crossFilter, config.xKey, config.yKeys]);

  const cellOpacity = useCallback((entry: ChartEntry): number => {
    if (!isFiltered) return 1;
    return isMatch(entry, crossFilter) ? 1 : 0.2;
  }, [isFiltered, crossFilter]);

  const cursorClass = useMemo(() => {
    if (onDrillDown || onCrossFilter) return 'cursor-pointer';
    return '';
  }, [onDrillDown, onCrossFilter]);

  if (isLoading) {
    return (
      <div className={`bg-surface-elevated rounded-xl border border-border-subtle p-5 shadow-sm ${className}`}>
        <div className="mb-4"><Skeleton variant="text" /></div>
        <Skeleton variant="chart" />
      </div>
    );
  }

  if (isEmpty || data.length === 0) {
    return (
      <div className={`bg-surface-elevated rounded-xl border border-border-subtle p-5 shadow-sm ${className}`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{title}</h3>
        </div>
        <div className="flex flex-col items-center justify-center h-[192px] text-text-muted">
          <BarChart3 className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm font-medium">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  const renderChart = () => {
    switch (type) {
      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsAreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              {config.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />}
              <XAxis dataKey={config.xKey} tick={{ fontSize: 10 }} interval="preserveStartEnd" tickFormatter={xTickFormatter} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={valueFormatter} />
              <GovernanceChartTooltip governanceContext={governanceContext} formatter={valueFormatter} />
              {config.yKeys?.map((yk, idx) => (
                <Area
                  key={yk.key}
                  type="monotone"
                  dataKey={yk.key}
                  stroke={yk.color || palette.colors[idx % palette.colors.length]}
                  fill={yk.fill || palette.fills[idx % palette.fills.length]}
                  strokeWidth={2}
                  name={yk.name || yk.key}
                  animationBegin={idx * 200}
                  className={cursorClass}
                  onClick={handleBarClick}
                />
              ))}
            </RechartsAreaChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              {config.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />}
              <XAxis dataKey={config.xKey} tick={{ fontSize: 10 }} tickFormatter={xTickFormatter} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={valueFormatter} />
              <GovernanceChartTooltip governanceContext={governanceContext} formatter={valueFormatter} />
              <Bar dataKey={config.yKeys?.[0]?.key || config.valueKey || 'value'} radius={[4, 4, 0, 0]} onClick={handleBarClick}>
                {data.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={getColorForEntry(entry, idx, config.colors, palette.colors)}
                    opacity={cellOpacity(entry, idx)}
                    className={cursorClass}
                  />
                ))}
              </Bar>
            </RechartsBarChart>
          </ResponsiveContainer>
        );

      case 'horizontal-bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              {config.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />}
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={valueFormatter} />
              <YAxis type="category" dataKey={config.xKey} tick={{ fontSize: 10 }} width={60} />
              <GovernanceChartTooltip governanceContext={governanceContext} formatter={valueFormatter} />
              <Bar dataKey={config.yKeys?.[0]?.key || config.valueKey || 'value'} radius={[0, 4, 4, 0]} onClick={handleBarClick}>
                {data.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={getColorForEntry(entry, idx, config.colors, palette.colors)}
                    opacity={cellOpacity(entry, idx)}
                    className={cursorClass}
                  />
                ))}
              </Bar>
            </RechartsBarChart>
          </ResponsiveContainer>
        );

      case 'stacked-bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              {config.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />}
              <XAxis dataKey={config.xKey} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={valueFormatter} />
              {config.showLegend !== false && <Legend wrapperStyle={{ fontSize: 10 }} />}
              <GovernanceChartTooltip governanceContext={governanceContext} formatter={valueFormatter} />
              {config.yKeys?.map((yk, idx) => (
                <Bar
                  key={yk.key}
                  dataKey={yk.key}
                  fill={yk.color || palette.colors[idx % palette.colors.length]}
                  name={yk.name || yk.key}
                  radius={[4, 4, 0, 0]}
                  stackId="stack"
                  animationBegin={idx * 200}
                  className={cursorClass}
                  onClick={handleBarClick}
                />
              ))}
            </RechartsBarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPieChart>
              <Pie
                data={data}
                dataKey={config.valueKey || 'value'}
                nameKey={config.nameKey || 'name'}
                cx="50%" cy="50%" outerRadius={70}
                label={(p: ChartEntry & { percent?: number }) => `${p[config.nameKey || 'name'] ?? ''} (${((p.percent ?? 0) * 100).toFixed(0)}%)`}
                labelLine={false}
                style={{ fontSize: 10 }}
              >
                {data.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={getColorForEntry(entry, idx, config.colors, palette.colors)}
                    opacity={cellOpacity(entry, idx)}
                    className={cursorClass}
                    onClick={() => handlePieClick(entry, idx)}
                  />
                ))}
              </Pie>
              <GovernanceChartTooltip governanceContext={governanceContext} formatter={valueFormatter} />
            </RechartsPieChart>
          </ResponsiveContainer>
        );

      case 'radar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsRadarChart data={data}>
              {config.showGrid !== false && <PolarGrid stroke="#e2e8f0" />}
              <PolarAngleAxis dataKey={config.xKey} tick={{ fontSize: 10 }} />
              <PolarRadiusAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
              <GovernanceChartTooltip governanceContext={governanceContext} formatter={valueFormatter} />
              {config.yKeys?.map((yk, idx) => (
                <Radar
                  key={yk.key}
                  name={yk.name || yk.key}
                  dataKey={yk.key}
                  stroke={yk.color || palette.colors[idx % palette.colors.length]}
                  fill={yk.color || palette.colors[idx % palette.colors.length]}
                  fillOpacity={0.15 + idx * 0.1}
                  strokeWidth={2}
                  animationBegin={idx * 300}
                  className={cursorClass}
                  onClick={handleRadarClick}
                />
              ))}
            </RechartsRadarChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              {config.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />}
              <XAxis dataKey={config.xKey} tick={{ fontSize: 10 }} interval="preserveStartEnd" tickFormatter={xTickFormatter} />
              <YAxis tick={{ fontSize: 10 }} domain={config.max ? [0, config.max] : undefined} tickFormatter={valueFormatter} />
              <GovernanceChartTooltip governanceContext={governanceContext} formatter={valueFormatter} />
              {config.threshold !== undefined && config.threshold !== null && (
                <ReferenceLine y={config.threshold} stroke="#f59e0b" strokeDasharray="4 4" />
              )}
              {config.yKeys?.map((yk, idx) => (
                <Line
                  key={yk.key}
                  type="monotone"
                  dataKey={yk.key}
                  stroke={yk.color || palette.colors[idx % palette.colors.length]}
                  strokeWidth={2.5}
                  dot={{ r: 3, strokeWidth: 0 }}
                  name={yk.name || yk.key}
                  animationBegin={idx * 150}
                  className={cursorClass}
                  onClick={handleBarClick}
                />
              ))}
            </RechartsLineChart>
          </ResponsiveContainer>
        );

      case 'composed':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsComposedChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              {config.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />}
              <XAxis dataKey={config.xKey} tick={{ fontSize: 10 }} interval="preserveStartEnd" tickFormatter={xTickFormatter} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={valueFormatter} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} domain={[0, 100]} width={34} />
              {config.showLegend !== false && <Legend wrapperStyle={{ fontSize: 10 }} />}
              <GovernanceChartTooltip governanceContext={governanceContext} formatter={valueFormatter} />
              {config.yKeys?.map((yk, idx) => (
                <Bar
                  key={yk.key}
                  yAxisId="left"
                  dataKey={yk.key}
                  fill={yk.color || palette.colors[idx % palette.colors.length]}
                  name={yk.name || yk.key}
                  radius={[4, 4, 0, 0]}
                  stackId={config.stacked ? 'stack' : undefined}
                  animationBegin={idx * 150}
                  className={cursorClass}
                  onClick={handleBarClick}
                />
              ))}
              {config.y2Keys?.map((yk, idx) => (
                <Line
                  key={yk.key}
                  yAxisId="right"
                  type="monotone"
                  dataKey={yk.key}
                  stroke={yk.color || palette.colors[((config.yKeys?.length || 0) + idx) % palette.colors.length]}
                  strokeWidth={2.5}
                  dot={{ r: 3, strokeWidth: 0 }}
                  name={yk.name || yk.key}
                  animationBegin={((config.yKeys?.length || 0) + idx) * 150}
                  className={cursorClass}
                  onClick={handleBarClick}
                />
              ))}
            </RechartsComposedChart>
          </ResponsiveContainer>
        );

      case 'donut': {
        const total = computeDonutTotal(data, config);
        return (
          <div className="relative w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={data}
                  dataKey={config.valueKey || 'value'}
                  nameKey={config.nameKey || 'name'}
                  cx="50%"
                  cy="50%"
                  innerRadius={54}
                  outerRadius={76}
                  paddingAngle={2}
                  cornerRadius={4}
                  style={{ fontSize: 10 }}
                >
                  {data.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={getColorForEntry(entry, idx, config.colors, palette.colors)}
                      opacity={cellOpacity(entry, idx)}
                      className={cursorClass}
                      onClick={() => handlePieClick(entry, idx)}
                    />
                  ))}
                </Pie>
                <GovernanceChartTooltip governanceContext={governanceContext} formatter={valueFormatter} />
              </RechartsPieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[9px] uppercase tracking-wider text-text-muted">Total</span>
              <span className="text-base font-bold text-text-primary leading-tight">
                {valueFormatter ? valueFormatter(total) : total.toLocaleString()}
              </span>
            </div>
          </div>
        );
      }

      case 'radial-bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsRadialBarChart data={data} innerRadius="25%" outerRadius="100%" startAngle={90} endAngle={-270}>
              <PolarAngleAxis type="number" domain={[0, config.max || 100]} tick={false} />
              <GovernanceChartTooltip governanceContext={governanceContext} formatter={valueFormatter} />
              <RadialBar
                dataKey={config.yKeys?.[0]?.key || config.valueKey || 'value'}
                background={{ fill: 'var(--color-surface-hover)' }}
                cornerRadius={4}
                animationBegin={0}
              >
                {data.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={getColorForEntry(entry, idx, config.colors, palette.colors)}
                    opacity={cellOpacity(entry, idx)}
                    className={cursorClass}
                    onClick={handleBarClick}
                  />
                ))}
              </RadialBar>
            </RechartsRadialBarChart>
          </ResponsiveContainer>
        );

      case 'funnel':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsFunnelChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <GovernanceChartTooltip governanceContext={governanceContext} formatter={valueFormatter} />
              <Funnel
                dataKey={config.valueKey || 'value'}
                nameKey={config.nameKey || 'name'}
                label={{ fill: 'var(--color-text-secondary)', fontSize: 10 }}
                isAnimationActive
              >
                {data.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={getColorForEntry(entry, idx, config.colors, palette.colors)}
                    opacity={cellOpacity(entry, idx)}
                    className={cursorClass}
                    onClick={() => handlePieClick(entry, idx)}
                  />
                ))}
              </Funnel>
            </RechartsFunnelChart>
          </ResponsiveContainer>
        );

      case 'treemap':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsTreemap
              data={data}
              dataKey={config.valueKey || 'value'}
              nameKey={config.nameKey || 'name'}
              isAnimationActive
              content={
                <TreemapContent
                  colors={config.colors || palette.colors}
                  valueKey={config.valueKey || 'value'}
                  isFiltered={isFiltered}
                  isMatch={(entry: ChartEntry) => isMatch(entry, crossFilter)}
                  cursorClass={cursorClass}
                  formatValue={valueFormatter}
                  onClick={handleBarClick}
                />
              }
            >
              <GovernanceChartTooltip governanceContext={governanceContext} formatter={valueFormatter} />
            </RechartsTreemap>
          </ResponsiveContainer>
        );

      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsScatterChart margin={{ top: 10, right: 15, left: 10, bottom: 10 }}>
              {config.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />}
              <XAxis type="number" dataKey={config.xKey} name={config.xKey} tick={{ fontSize: 10 }} tickFormatter={valueFormatter} />
              <YAxis type="number" dataKey={config.yKeys?.[0]?.key || config.valueKey || 'value'} name={config.yKeys?.[0]?.name || 'value'} tick={{ fontSize: 10 }} tickFormatter={valueFormatter} />
              {config.zKey && <ZAxis type="number" dataKey={config.zKey} range={[60, 240]} />}
              <GovernanceChartTooltip governanceContext={governanceContext} formatter={valueFormatter} />
              <Scatter data={data} animationBegin={0}>
                {data.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={getColorForEntry(entry, idx, config.colors, palette.colors)}
                    opacity={cellOpacity(entry, idx)}
                    className={cursorClass}
                    onClick={handleBarClick}
                  />
                ))}
              </Scatter>
            </RechartsScatterChart>
          </ResponsiveContainer>
        );

      case 'gauge': {
        const entry = data[0];
        const value = Number(entry?.[config.valueKey || 'value'] ?? 0);
        const max = config.max || 100;
        const threshold = config.threshold ?? 90;
        const pct = Math.min(Math.max(value / max, 0), 1);
        const color = value >= threshold ? 'var(--color-error)' : value >= max * 0.75 ? 'var(--color-warning)' : 'var(--color-success)';
        const cx = 100;
        const cy = 104;
        const r = 78;
        const track = arcPath(cx, cy, r, 135, 405);
        const thresholdPoint = polarToCartesian(cx, cy, r, 135 + (270 * Math.min(Math.max(threshold / max, 0), 1)));
        return (
          <div className="relative w-full h-full flex flex-col items-center justify-center">
            <svg viewBox="0 0 200 130" className="w-full max-h-full">
              <path d={track} fill="none" stroke="var(--color-surface-hover)" strokeWidth={14} strokeLinecap="round" />
              <motion.path
                d={track}
                fill="none"
                stroke={color}
                strokeWidth={14}
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: pct }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
                className={cursorClass}
                onClick={() => entry && handleBarClick(entry)}
              />
              {threshold > 0 && (
                <line x1={thresholdPoint.x} y1={thresholdPoint.y - 9} x2={thresholdPoint.x} y2={thresholdPoint.y + 9} stroke="#f59e0b" strokeWidth={2.5} strokeLinecap="round" />
              )}
              <text x={cx} y={cy - 6} textAnchor="middle" fontSize={24} fontWeight={700} fill="var(--color-text-primary)">
                {valueFormatter ? valueFormatter(value) : `${Math.round(value)}%`}
              </text>
              <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fill="var(--color-text-muted)">
                {threshold > 0 ? `Target ${threshold}` : `Max ${max}`}
              </text>
            </svg>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={animated ? { opacity: 0, y: 8 } : undefined}
      animate={animated ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`bg-surface-elevated rounded-xl border border-border-subtle p-5 shadow-sm ${className}`}
    >
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="p-1.5 rounded-lg bg-surface-hover shrink-0">
            <Layers className={`w-3.5 h-3.5 ${governanceContext === 'sla' ? 'text-success' : governanceContext === 'risk' ? 'text-warning' : governanceContext === 'audit' ? 'text-chart-purple' : governanceContext === 'policy' ? 'text-chart-emerald' : 'text-accent'}`} />
          </span>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide truncate">{title}</h3>
            {subtitle && <p className="text-[10px] text-text-muted truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {periodOptions && periodValue && onPeriodChange && (
            <div className="flex gap-1 mr-1">
              {periodOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onPeriodChange(opt.value)}
                  className={`px-2 py-1 text-[10px] font-semibold rounded transition cursor-pointer ${
                    periodValue === opt.value
                      ? 'bg-accent text-[#fff]'
                      : 'bg-surface-hover text-text-secondary hover:bg-border-subtle'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          {exportable && (
            <button
              onClick={handleExportCSV}
              disabled={isExporting}
              className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-secondary transition cursor-pointer disabled:opacity-50"
              aria-label="Export chart data as CSV"
              title="Export CSV"
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${type}-${data.length}`}
          initial={animated ? { opacity: 0 } : undefined}
          animate={{ opacity: 1 }}
          exit={animated ? { opacity: 0 } : undefined}
          transition={{ duration: 0.2 }}
          ref={chartRef}
          style={{ height }}
          className="-ml-2"
        >
          {renderChart()}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

export default memo(GovernanceChart);
