import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, CalendarDays, CircleDot, LoaderCircle, PieChart, Plus, SlidersHorizontal, Sparkles, Table2 } from 'lucide-react';
import ChartSwitcher from './ChartSwitcher.jsx';
import DataChart from './DataChart.jsx';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function AnalysisBuilder({ session }) {
  const profiles = session.profiles || {};
  const columns = Object.keys(profiles);
  const categorical = columns.filter(name => profiles[name].type === 'categorical');
  const dates = columns.filter(name => profiles[name].type === 'datetime');
  const numeric = columns.filter(name => profiles[name].type === 'numeric');
  const preferredX = categorical.find(name => /customer|status|category|product|region|country/.test(name)) || categorical.find(name => !/(^id$|_id$|_code$|_number$)/.test(name)) || categorical[0] || dates[0] || '';
  const [xAxis, setXAxis] = useState(preferredX);
  const [yAxis, setYAxis] = useState(numeric[0] || '');
  const [aggregation, setAggregation] = useState('sum');
  const [chartType, setChartType] = useState('bar');
  const [filterColumn, setFilterColumn] = useState('');
  const [filterValue, setFilterValue] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [chart, setChart] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const filterValues = useMemo(() => filterColumn && profiles[filterColumn]?.values ? profiles[filterColumn].values : [], [filterColumn, profiles]);

  useEffect(() => {
    let ignore = false;
    if (!xAxis || (!yAxis && aggregation !== 'count')) { setChart(null); return; }
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const response = await fetch(`${API}/chart`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: session.session_id, chart_type: chartType, x_axis: xAxis, y_axis: yAxis || null, aggregation, filters: filterColumn && filterValue !== 'All' ? { [filterColumn]: filterValue } : {}, date_from: dateFrom || null, date_to: dateTo || null }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Could not build this analysis.');
        if (!ignore) setChart(data);
      } catch (e) { if (!ignore) setError(e.message); }
      finally { if (!ignore) setLoading(false); }
    }, 220);
    return () => { ignore = true; clearTimeout(timer); };
  }, [session.session_id, xAxis, yAxis, aggregation, chartType, filterColumn, filterValue, dateFrom, dateTo]);

  const drop = (event, setter) => { event.preventDefault(); const name = event.dataTransfer.getData('text/plain'); if (profiles[name]) setter(name); };
  const chip = (name) => <button draggable key={name} className="builder-column" onDragStart={e => e.dataTransfer.setData('text/plain', name)} title="Drag to an axis"><span className={`type-token ${profiles[name].type}`}>{profiles[name].type === 'numeric' ? '123' : profiles[name].type === 'datetime' ? '◷' : 'Aa'}</span>{name.replaceAll('_', ' ')}</button>;

  return <section className="analysis-builder">
    <div className="builder-heading"><div><div className="section-kicker"><SlidersHorizontal size={13}/> BUILD AN ANALYSIS</div><h2>Explore it your way</h2><p>Choose fields, set the calculation, and the chart updates as you work.</p></div><span className="live-tag"><i/> LIVE PREVIEW</span></div>
    <div className="builder-layout">
      <div className="builder-controls">
        <div className="builder-block"><label>AVAILABLE FIELDS</label><div className="field-chips">{columns.map(chip)}</div></div>
        <div className="drop-axis-grid">
          <div className="axis-drop" onDragOver={e => e.preventDefault()} onDrop={e => drop(e, setXAxis)}><span><ArrowRight size={13}/> X-AXIS</span><select value={xAxis} onChange={e => setXAxis(e.target.value)}>{columns.map(col => <option key={col} value={col}>{col.replaceAll('_', ' ')}</option>)}</select><small>Drop or choose a field</small></div>
          <div className="axis-drop" onDragOver={e => e.preventDefault()} onDrop={e => drop(e, setYAxis)}><span><ArrowUp size={13}/> Y-AXIS</span><select value={yAxis} onChange={e => setYAxis(e.target.value)}><option value="">Row count</option>{numeric.map(col => <option key={col} value={col}>{col.replaceAll('_', ' ')}</option>)}</select><small>Numeric values only</small></div>
        </div>
        <div className="builder-options"><label>AGGREGATION<select value={aggregation} onChange={e => setAggregation(e.target.value)}><option value="sum">Sum</option><option value="mean">Average</option><option value="count">Count</option></select></label><label>FILTER BY<select value={filterColumn} onChange={e => { setFilterColumn(e.target.value); setFilterValue('All'); }}><option value="">No filter</option>{categorical.map(col => <option key={col} value={col}>{col.replaceAll('_', ' ')}</option>)}</select></label>{filterColumn && <label>VALUE<select value={filterValue} onChange={e => setFilterValue(e.target.value)}><option>All</option>{filterValues.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}</div>
        {dates.length > 0 && <div className="date-filter"><span><CalendarDays size={13}/> DATE RANGE <small>{dates[0].replaceAll('_', ' ')}</small></span><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}/><span className="date-to">to</span><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}/></div>}
      </div>
      <div className="builder-result"><div className="builder-result-head"><span><Sparkles size={13}/> CUSTOM ANALYSIS</span><ChartSwitcher compact value={chartType} onChange={setChartType}/></div><div className="builder-chart">{loading ? <div className="chart-loading"><LoaderCircle size={16}/> Updating preview…</div> : error ? <div className="chart-empty">{error}</div> : chart ? <DataChart chart={chart} view={chartType} compact/> : <div className="chart-empty"><Plus size={16}/> Choose an axis to start exploring.</div>}</div><div className="builder-result-foot"><span>{chart?.count ?? 0} groups</span><span>{aggregation} {yAxis?.replaceAll('_', ' ') || 'rows'} by {xAxis?.replaceAll('_', ' ')}</span></div></div>
    </div>
  </section>;
}
