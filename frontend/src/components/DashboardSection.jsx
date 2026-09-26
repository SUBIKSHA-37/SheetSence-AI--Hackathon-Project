import React, { useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, CalendarDays, CircleHelp, Database, FileSpreadsheet, LoaderCircle, RefreshCw, Sparkles, TrendingUp } from 'lucide-react';
import AnalysisBuilder from './AnalysisBuilder.jsx';
import DataChart from './DataChart.jsx';

const fmt = value => value == null ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });

function MetricCard({ label, value, foot, icon: Icon, tone }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={15}/></span></div><strong>{fmt(value)}</strong><small>{foot}</small></div>;
}

function Panel({ title, note, children, className = '' }) {
  return <section className={`dashboard-panel ${className}`}><div className="panel-heading"><div><h3>{title}</h3>{note && <span>{note}</span>}</div><button className="panel-more" title="More options"><CircleHelp size={14}/></button></div>{children}</section>;
}

export default function DashboardSection({ session, dashboard, onAsk, busy, error }) {
  const [exporting, setExporting] = useState(false);
  const rows = (session.summary.total_rows ?? session.summary.rows).toLocaleString();
  const missingFixed = session.summary.missing_values_fixed ?? session.summary.missing_filled;
  const duplicatesRemoved = session.summary.duplicates_removed ?? session.summary.removed_duplicates;
  const columnsStandardized = session.summary.columns_cleaned ?? 0;
  const download = () => {
    const values = [['Column', 'Type', 'Unique values'], ...Object.entries(session.profiles).map(([name, p]) => [name, p.type, p.unique])];
    const csv = values.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'sheetsense-profile.csv'; a.click(); URL.revokeObjectURL(url); setExporting(true); setTimeout(() => setExporting(false), 900);
  };
  const ask = question => onAsk(question);
  return <div className="dashboard-page">
    <div className="view-heading"><div><div className="eyebrow"><span className="eyebrow-pulse"/> DATA WORKSPACE <span className="eyebrow-divider">/</span> OVERVIEW</div><h1>Your data, at a glance.</h1><p>Live analysis of <b>{session.filename}</b> · {rows} rows across {session.summary.columns} fields</p></div><div className="heading-actions"><button className="secondary-button" onClick={download}><ArrowDownToLine size={14}/>{exporting ? 'Exported' : 'Export profile'}</button><button className="primary-button" onClick={() => ask('Summarize this dataset')} disabled={busy}><Sparkles size={14}/> Generate insight</button></div></div>
      <div className="data-status-strip"><div className="status-left"><span className="status-orb"><Database size={13}/></span><div><b>Dataset is ready to explore</b><span>{session.filename} · uploaded just now</span></div></div><div className="status-meta"><span><i className="green-dot"/> Cleaned</span><span>{missingFixed} missing handled</span><span>{duplicatesRemoved} duplicates removed</span><span>{session.summary.total_columns ?? session.summary.columns} columns profiled</span></div><span className="status-date"><CalendarDays size={13}/> Session dataset</span></div>
    <section className="cleaning-summary" aria-labelledby="cleaning-summary-title">
      <div className="cleaning-summary-heading"><div><span className="cleaning-kicker">DATA QUALITY</span><h2 id="cleaning-summary-title">Data Cleaning Summary</h2></div><span className="cleaning-ready"><i/> Ready for analysis</span></div>
      <div className="cleaning-summary-grid">
        <div className="cleaning-stat"><span>Rows cleaned</span><strong>{fmt(session.summary.total_rows ?? session.summary.rows)}</strong><small>{fmt(session.summary.invalid_rows_removed ?? 0)} unusable rows removed</small></div>
        <div className="cleaning-stat"><span>Missing values handled</span><strong>{fmt(missingFixed)}</strong><small>Median, Unknown, or date fill</small></div>
        <div className="cleaning-stat"><span>Duplicates removed</span><strong>{fmt(duplicatesRemoved)}</strong><small>Exact duplicate records</small></div>
        <div className="cleaning-stat"><span>Columns standardized</span><strong>{fmt(columnsStandardized)}</strong><small>of {fmt(session.summary.original_columns ?? session.summary.total_columns ?? session.summary.columns)} source columns</small></div>
      </div>
    </section>
    {error && <div className="error-banner">{error}</div>}
    {!dashboard ? <div className="loading-card"><LoaderCircle size={18}/> Preparing dashboard…</div> : <>
      <div className="metrics-grid">
        <MetricCard label="TOTAL INVOICED" value={dashboard.totals.invoiced} foot={dashboard.columns.amount ? `Sum of ${dashboard.columns.amount.replaceAll('_', ' ')}` : 'No amount column detected'} icon={TrendingUp} tone="sky"/>
        <MetricCard label="PAID" value={dashboard.totals.paid} foot={dashboard.columns.status ? `Based on ${dashboard.columns.status.replaceAll('_', ' ')}` : 'No paid status detected'} icon={ArrowUpRight} tone="green"/>
        <MetricCard label="OUTSTANDING" value={dashboard.totals.outstanding} foot={dashboard.columns.status ? 'Unpaid, open, and overdue' : 'No outstanding status detected'} icon={RefreshCw} tone="orange"/>
        <MetricCard label="AVERAGE VALUE" value={dashboard.totals.average_invoice} foot={`${rows} records analyzed`} icon={FileSpreadsheet} tone="violet"/>
      </div>
      <div className="chart-grid">
        <Panel title="Invoice status" note={dashboard.columns.status ? `By ${dashboard.columns.status.replaceAll('_', ' ')}` : 'No status field detected'}><DataChart compact view="bar" chart={{ label: dashboard.columns.status || 'status', metric: 'count', data: dashboard.status_counts }}/></Panel>
        <Panel title="Monthly comparison" note={dashboard.columns.date ? `Grouped by ${dashboard.columns.date.replaceAll('_', ' ')}` : 'Add a date field for trends'}><DataChart compact view="line" chart={{ label: 'month', metric: dashboard.columns.amount || 'value', data: dashboard.monthly }}/></Panel>
        <Panel title="Top 10 customers" note={dashboard.columns.customer ? `Ranked by ${dashboard.columns.amount || 'value'}` : 'No customer field detected'}><DataChart compact view="bar" chart={{ label: dashboard.columns.customer || 'customer', metric: dashboard.columns.amount || 'value', data: dashboard.top_customers }}/></Panel>
        <Panel title="Overdue profile" note={dashboard.columns.overdue_days ? `Grouped by ${dashboard.columns.overdue_days.replaceAll('_', ' ')}` : dashboard.columns.status ? 'By current status' : 'No aging or status field found'}><DataChart compact view="pie" chart={{ label: dashboard.columns.overdue_days || dashboard.columns.status || 'range', metric: 'count', data: dashboard.overdue_ranges }}/></Panel>
        <Panel title="Highest outstanding" note="Open balances by customer" className="wide-panel"><div className="rank-list">{dashboard.outstanding_customers.length ? dashboard.outstanding_customers.slice(0, 5).map((row, i) => { const key = dashboard.columns.customer || 'customer'; const metric = dashboard.columns.amount || 'value'; const max = Math.max(...dashboard.outstanding_customers.map(item => Number(item[metric]) || 0), 1); return <button key={`${row[key]}-${i}`} onClick={() => ask(`Show unpaid invoices for ${row[key]}`)} className="rank-row"><span className="rank-number">{String(i + 1).padStart(2, '0')}</span><span className="rank-name">{row[key]}</span><span className="rank-track"><i style={{ width: `${Number(row[metric]) / max * 100}%` }}/></span><b>{fmt(row[metric])}</b><ArrowRight size={13}/></button>; }) : <div className="panel-empty">No unpaid invoice statuses or overdue days were detected in this dataset.</div>}</div></Panel>
        <Panel title="Dataset profile" note="Column types and uniqueness" className="profile-panel"><div className="profile-columns">{Object.entries(session.profiles).slice(0, 7).map(([name, profile]) => <div key={name}><span className={`type-token ${profile.type}`}>{profile.type === 'numeric' ? '123' : profile.type === 'datetime' ? '◷' : 'Aa'}</span><b>{name.replaceAll('_', ' ')}</b><small>{profile.unique.toLocaleString()} unique</small></div>)}</div><button className="subtle-link" onClick={download}>Download data profile <ArrowRight size={13}/></button></Panel>
      </div>
    </>}
    <AnalysisBuilder session={session}/>
    <div className="next-question"><div><div className="next-sparkle"><Sparkles size={15}/></div><div><b>Keep exploring</b><span>Ask a question and follow where the data leads.</span></div></div><button onClick={() => ask('What are the key takeaways from this dataset?')} disabled={busy}>Ask the analyst <ArrowRight size={14}/></button></div>
  </div>;
}
