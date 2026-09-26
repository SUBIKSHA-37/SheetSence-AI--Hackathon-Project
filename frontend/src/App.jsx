import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CircleHelp, Command, Database, Search, Sparkles } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import UploadSection from './components/UploadSection.jsx';
import DashboardSection from './components/DashboardSection.jsx';
import ChatSection from './components/ChatSection.jsx';
import HistorySection from './components/HistorySection.jsx';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function App() {
  const [session, setSession] = useState(null);
  const [page, setPage] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(false);
  const [search, setSearch] = useState('');
  const searchInput = useRef(null);

  useEffect(() => { fetch(`${API}/health`).then(r => setOnline(r.ok)).catch(() => setOnline(false)); }, []);
  useEffect(() => {
    const shortcut = event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInput.current?.focus(); } };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (!session) return;
    let active = true;
    const get = async url => {
      const response = await fetch(url);
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || 'This dataset session is no longer available.');
      return body;
    };
    Promise.all([
      get(`${API}/dashboard?session_id=${encodeURIComponent(session.session_id)}`),
      get(`${API}/history?session_id=${encodeURIComponent(session.session_id)}`),
    ]).then(([dash, past]) => { if (active) { setDashboard(dash); setHistory(past.items || []); } }).catch(e => {
      if (!active) return;
      setError(e.message || 'This dataset session ended. Upload the file again to continue.');
      setSession(null); setDashboard(null); setHistory([]); setPage('overview');
    });
    return () => { active = false; };
  }, [session]);

  const upload = async (file) => {
    if (!file) return;
    setError(''); setBusy(true);
    try {
      const form = new FormData(); form.append('file', file);
      const response = await fetch(`${API}/upload`, { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || 'Upload failed.');
      setSession({ ...body, file }); setHistory([]); setDashboard(null); setPage('overview');
    } catch (e) { setError(e.message || 'Could not connect to SheetSense API.'); }
    finally { setBusy(false); }
  };

  const ask = async (question) => {
    if (!session || !question.trim()) return null;
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API}/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: session.session_id, question }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Query failed.');
      const item = { question, result, created_at: new Date().toISOString() };
      setHistory(items => [item, ...items]); setPage('chat');
      return item;
    } catch (e) { setError(e.message || 'Query failed.'); return null; }
    finally { setBusy(false); }
  };

  const rerun = async (item) => { await ask(item.question); };
  const nav = (next) => { setPage(next); setSearch(''); };
  const title = page === 'overview' ? 'Overview' : page === 'chat' ? 'Ask your data' : 'Query history';

  return <div className="app-shell">
    <Sidebar page={page} onNavigate={nav} session={session} historyCount={history.length} onUpload={upload}/>
    <main className="main-area">
      <header className="topbar">
        <div className="breadcrumbs"><span>Acme workspace</span><span className="crumb-sep">/</span><b>{session?.filename || title}</b></div>
        <div className="top-actions">
          <label className="global-search"><Search size={14}/><input ref={searchInput} value={search} onChange={e => { setSearch(e.target.value); if (e.target.value && session) setPage('history'); }} placeholder="Search saved questions"/><kbd><Command size={10}/> K</kbd></label>
          <span className={`service-state ${online ? 'is-online' : ''}`}><i/>{online ? 'All systems normal' : 'API unavailable'}</span>
          <button className="top-icon" title="Help"><CircleHelp size={16}/></button><div className="top-avatar">A</div>
        </div>
      </header>
      <div className="page-content">
        {!session ? <UploadSection onUpload={upload} busy={busy} error={error}/> : page === 'overview' ? <DashboardSection session={session} dashboard={dashboard} onAsk={ask} busy={busy} error={error}/> : page === 'chat' ? <ChatSection history={history} onAsk={ask} busy={busy} error={error}/> : <HistorySection history={history} search={search} onRerun={rerun} onFollowUp={() => nav('chat')}/>}
        {session && <footer className="page-footer"><span><Database size={12}/> Data stays in this local session</span><span>SheetSense AI <ArrowUpRight size={12}/></span></footer>}
      </div>
    </main>
  </div>;
}
