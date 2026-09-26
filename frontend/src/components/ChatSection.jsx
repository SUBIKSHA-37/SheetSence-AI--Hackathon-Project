import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, LoaderCircle, MessageSquareText, Paperclip, Send, Sparkles, WandSparkles } from 'lucide-react';
import ChartSwitcher from './ChartSwitcher.jsx';
import DataChart from './DataChart.jsx';

const suggestions = ['Show total revenue', 'Top 10 customers by invoice value', 'Compare revenue across months', 'Show unpaid invoices'];

export default function ChatSection({ history, onAsk, busy, error }) {
  const [question, setQuestion] = useState(''); const [view, setView] = useState(history[0]?.result?.chart?.type || 'bar'); const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => setActiveIndex(0), [history.length]);
  const ordered = useMemo(() => [...history].reverse(), [history]);
  const submit = async (text = question) => { if (!text.trim() || busy) return; setQuestion(''); const item = await onAsk(text); if (item?.result?.chart?.type) setView(item.result.chart.type); };
  const exportResult = item => {
    if (!item?.result?.table?.length) return;
    const table = item.result.table; const keys = Object.keys(table[0]);
    const csv = [keys.join(','), ...table.map(row => keys.map(key => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(','))].join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'sheetsense-query.csv'; link.click(); URL.revokeObjectURL(link.href);
  };
  const latest = history[0];
  return <div className="chat-page">
    <div className="view-heading"><div><div className="eyebrow"><span className="eyebrow-pulse"/> SHEETSENSE ANALYST</div><h1>Ask your data.</h1><p>Ask a question, refine the answer, and keep the context as you go.</p></div><span className="context-badge"><WandSparkles size={13}/> Context memory on</span></div>
    {error && <div className="error-banner">{error}</div>}
    {!history.length ? <div className="chat-welcome"><div className="chat-glow"><Sparkles size={21}/></div><h2>Start with the question on your mind.</h2><p>I can rank, compare, filter, and find patterns across your spreadsheet.</p><div className="prompt-suggestions">{suggestions.map(text => <button key={text} onClick={() => submit(text)}>{text}<ArrowUpRight size={13}/></button>)}</div></div> : <div className="conversation-list">{ordered.map((item, index) => { const selected = history.length - 1 - index === activeIndex; return <article className={`conversation-turn ${selected ? 'latest-turn' : ''}`} key={`${item.created_at || item.question}-${index}`}><div className="question-line"><span className="question-avatar">A</span><div><small>YOU ASKED</small><p>{item.question}</p></div><time>{new Date(item.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><div className="answer-block"><div className="answer-brand"><Sparkles size={13}/><span>SHEETSENSE</span></div><p className="answer-insight">{item.result.insight}</p>{selected && <div className="answer-followup">{item.result.follow_up}</div>}
      {selected && <div className="answer-visual"><div className="visual-head"><div><b>Result preview</b><span>{item.result.table.length} rows returned</span></div><div className="visual-tools"><button onClick={() => exportResult(item)} title="Export results"><ArrowDownToLine size={14}/></button><ChartSwitcher compact value={view} onChange={setView}/></div></div><DataChart chart={item.result.chart} view={view}/></div>}
      <div className="answer-meta"><span><span className="check-pip"/> Based on {item.result.plan?.metric?.replaceAll('_', ' ') || 'your dataset'}</span>{!selected && <button onClick={() => { setActiveIndex(history.length - 1 - index); setView(item.result.chart.type); }}>View answer <ArrowRight size={12}/></button>}</div></div></article>; })}</div>}
    <form className="chat-composer" onSubmit={e => { e.preventDefault(); submit(); }}><button className="composer-attach" type="button" title="Attach a question context"><Paperclip size={16}/></button><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask a follow-up, or start a new analysis…"/><button type="submit" className="composer-send" disabled={!question.trim() || busy} title="Send question">{busy ? <LoaderCircle size={16} className="spinning"/> : <Send size={16}/>}</button><div className="composer-note"><span><Sparkles size={11}/> Answers grounded in this dataset</span><span>Enter to send</span></div></form>
    {latest && <div className="followup-row"><MessageSquareText size={14}/><span>Continue from <b>“{latest.question}”</b></span><button onClick={() => document.querySelector('.chat-composer input')?.focus()}>Ask a follow-up <ArrowRight size={13}/></button></div>}
  </div>;
}
