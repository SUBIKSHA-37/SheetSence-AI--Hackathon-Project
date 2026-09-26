import React, { useRef } from 'react';
import { Activity, ArrowUpRight, Clock3, FileSpreadsheet, LayoutDashboard, Plus, Settings2, Sparkles, UploadCloud } from 'lucide-react';

export default function Sidebar({ page, onNavigate, session, historyCount, onUpload }) {
  const input = useRef(null);
  return <aside className="sidebar">
    <div className="brand"><div className="brand-icon"><Activity size={18}/></div><span>SheetSense<sup>AI</sup></span></div>
    <button className="workspace-switch"><span className="workspace-logo">A</span><span><b>Acme Analytics</b><small>Free workspace</small></span><span className="switch-caret">⌄</span></button>
    <button className="new-dataset" onClick={() => input.current?.click()}><Plus size={15}/> New dataset</button>
    <input ref={input} type="file" hidden accept=".csv,.xlsx,.json" onChange={e => { onUpload(e.target.files?.[0]); e.target.value = ''; }}/>
    <div className="nav-label">ANALYZE</div>
    <button className={`nav-item ${page === 'overview' ? 'active' : ''}`} onClick={() => onNavigate('overview')}><LayoutDashboard size={16}/> Overview</button>
    <button className={`nav-item ${page === 'chat' ? 'active' : ''}`} onClick={() => onNavigate('chat')}><Sparkles size={16}/> Ask your data</button>
    <button className={`nav-item ${page === 'history' ? 'active' : ''}`} onClick={() => onNavigate('history')}><Clock3 size={16}/> Query history <span className="nav-count">{historyCount || ''}</span></button>
    <div className="nav-label dataset-label">YOUR DATA</div>
    {session ? <button className="data-file" onClick={() => onNavigate('overview')}><FileSpreadsheet size={15}/><span>{session.filename}</span><i/></button> : <div className="no-dataset"><UploadCloud size={15}/> Add a dataset to begin</div>}
    <div className="sidebar-bottom"><div className="sidebar-promo"><div><Sparkles size={14}/><b>Insights, on demand</b></div><p>Ask follow-up questions and explore your data from every angle.</p><button onClick={() => onNavigate('chat')}>Open analyst <ArrowUpRight size={13}/></button></div><button className="settings-button"><Settings2 size={15}/> Workspace settings</button><div className="user-profile"><div className="user-avatar">A</div><div><b>Analyst</b><small>Personal account</small></div><span>•••</span></div></div>
  </aside>;
}
