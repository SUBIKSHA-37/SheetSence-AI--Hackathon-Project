import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';

const palette = ['#58c6f3', '#23c98b', '#ad91ff', '#ffbb72', '#f181a4', '#60d8d0', '#8fa6ff'];
const tick = { fontSize: 10, fill: '#758397' };

export default function DataChart({ chart, view = 'bar', compact = false }) {
  const data = chart?.data || []; const label = chart?.label || Object.keys(data[0] || {})[0]; const metric = chart?.metric || Object.keys(data[0] || {})[1];
  const scatter = useMemo(() => data.map((row, index) => { const numericX = Number(row[label]); return { ...row, _plot_x: Number.isFinite(numericX) ? numericX : index + 1, _label: row[label] }; }), [data, label]);
  const stats = useMemo(() => {
    const values = data.map(row => Number(row[metric])).filter(Number.isFinite).sort((a, b) => a - b);
    const quantile = q => values.length ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * q))] : 0;
    const min = quantile(0), max = quantile(1), q1 = quantile(.25), median = quantile(.5), q3 = quantile(.75);
    const span = max - min || 1;
    return { min, max, q1, median, q3, minPct: (min - min) / span * 100, q1Pct: (q1 - min) / span * 100, medianPct: (median - min) / span * 100, q3Pct: (q3 - min) / span * 100, maxPct: (max - min) / span * 100 };
  }, [data, metric]);

  if (!data.length) return <div className="chart-empty">No matching rows. Adjust the filters to see results.</div>;
  if (view === 'table') return <div className="chart-table"><table><thead><tr>{Object.keys(data[0]).map(key => <th key={key}>{key.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{data.map((row, i) => <tr key={i}>{Object.values(row).map((value, j) => <td key={j}>{typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value ?? '—')}</td>)}</tr>)}</tbody></table></div>;
  if (view === 'boxplot') {
    const boxes = chart?.type === 'boxplot' && data[0]?.q1 != null ? data : [{ [label]: metric, ...stats }];
    const min = Math.min(...boxes.map(box => box.min)); const max = Math.max(...boxes.map(box => box.max)); const span = max - min || 1;
    const pos = value => (value - min) / span * 100;
    return <div className="boxplot-view"><div className="boxplot-label">{metric.replaceAll('_', ' ')} <span>distribution · {chart?.count ?? data.length} values</span></div><div className="boxplot-list">{boxes.slice(0, 8).map((box, i) => <div className="boxplot-row" key={`${box[label]}-${i}`}><span className="boxplot-group">{String(box[label])}</span><div className="boxplot-track"><i className="boxplot-whisker" style={{ left: `${pos(box.min)}%`, width: `${Math.max(1, pos(box.max) - pos(box.min))}%` }}/><i className="boxplot-box" style={{ left: `${pos(box.q1)}%`, width: `${Math.max(2, pos(box.q3) - pos(box.q1))}%` }}/><i className="boxplot-median" style={{ left: `${pos(box.median)}%` }}/></div></div>)}</div><div className="boxplot-values"><span>{min.toLocaleString()}</span><span>Min</span><span>Median</span><span>Max</span><span>{max.toLocaleString()}</span></div></div>;
  }
  const height = compact ? 188 : 248;
  return <div className="chart-canvas"><ResponsiveContainer width="100%" height={height}>
    {view === 'pie' ? <PieChart><Pie data={data.slice(0, 10)} dataKey={metric} nameKey={label} innerRadius={compact ? 38 : 54} outerRadius={compact ? 67 : 91} paddingAngle={3}>{data.slice(0, 10).map((_, i) => <Cell key={i} fill={palette[i % palette.length]}/>)}</Pie><Tooltip contentStyle={{ background: '#151f2e', border: '1px solid #2a394c', borderRadius: 6, color: '#e7edf5', fontSize: 11 }}/></PieChart> : view === 'line' ? <LineChart data={data} margin={{ top: 14, right: 12, left: -16, bottom: 3 }}><CartesianGrid stroke="#233143" vertical={false}/><XAxis dataKey={label} tick={tick} axisLine={false} tickLine={false}/><YAxis tick={tick} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: '#151f2e', border: '1px solid #2a394c', borderRadius: 6, color: '#e7edf5', fontSize: 11 }}/><Line type="monotone" dataKey={metric} stroke="#58c6f3" strokeWidth={2.3} dot={{ r: 3, fill: '#23c98b', stroke: '#0f1722', strokeWidth: 2 }}/></LineChart> : view === 'scatter' ? <ScatterChart margin={{ top: 14, right: 12, left: -16, bottom: 3 }}><CartesianGrid stroke="#233143"/><XAxis dataKey="_plot_x" type="number" name={label} tick={tick} axisLine={false} tickLine={false}/><YAxis dataKey={metric} type="number" name={metric} tick={tick} axisLine={false} tickLine={false}/><Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#151f2e', border: '1px solid #2a394c', borderRadius: 6, color: '#e7edf5', fontSize: 11 }}/><Scatter data={scatter} fill="#58c6f3"/></ScatterChart> : <BarChart data={data} margin={{ top: 14, right: 12, left: -16, bottom: 3 }}><CartesianGrid stroke="#233143" vertical={false}/><XAxis dataKey={label} tick={tick} axisLine={false} tickLine={false}/><YAxis tick={tick} axisLine={false} tickLine={false}/><Tooltip cursor={{ fill: '#1b2a3a' }} contentStyle={{ background: '#151f2e', border: '1px solid #2a394c', borderRadius: 6, color: '#e7edf5', fontSize: 11 }}/><Bar dataKey={metric} radius={[4, 4, 0, 0]} maxBarSize={38}>{data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]}/>)}</Bar></BarChart>}
  </ResponsiveContainer></div>;
}
