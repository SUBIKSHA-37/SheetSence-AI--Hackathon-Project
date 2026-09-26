import React, { useRef, useState } from 'react';
import { ArrowRight, FileSpreadsheet, FileText, LockKeyhole, Sparkles, UploadCloud } from 'lucide-react';

export default function UploadSection({ onUpload, busy, error }) {
  const picker = useRef(null); const [dragging, setDragging] = useState(false);
  return <section className="upload-page">
    <div className="upload-heading"><div className="eyebrow"><Sparkles size={13}/> SPREADSHEET ANALYSIS, REIMAGINED</div><h1>Your numbers have a story.<br/><span>Let's find it.</span></h1><p>Drop in your workbook. Get answers, patterns, and a clearer view of what matters.</p></div>
    <div className="upload-layout">
      <div className={`drop-panel ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); onUpload(e.dataTransfer.files?.[0]); }} onClick={() => picker.current?.click()}>
        <input ref={picker} type="file" accept=".csv,.xlsx,.json" hidden onChange={e => { onUpload(e.target.files?.[0]); e.target.value = ''; }}/>
        <div className="upload-orbit"><div className="upload-orbit-inner"><UploadCloud size={22}/></div><i/><i/><i/></div>
        <b>{busy ? 'Reading your workbook…' : <>Drop your file here, or <span>browse files</span></>}</b><small>Excel, CSV, or JSON · up to 25 MB</small>
        <div className="file-types"><span><FileSpreadsheet size={14}/> XLSX</span><span><FileText size={14}/> CSV</span><span><FileText size={14}/> JSON</span></div>
      </div>
      <div className="upload-aside"><div className="aside-kicker">BUILT FOR THE WAY YOU THINK</div><div className="aside-feature"><div className="feature-mark sky"><Sparkles size={16}/></div><div><b>Ask in plain language</b><span>Turn questions into answers, instantly.</span></div></div><div className="aside-feature"><div className="feature-mark green"><FileSpreadsheet size={16}/></div><div><b>Cleaned as you upload</b><span>Types, gaps, and duplicates handled for you.</span></div></div><div className="aside-feature"><div className="feature-mark violet"><ArrowRight size={16}/></div><div><b>See the whole picture</b><span>Metrics and trends emerge from your data.</span></div></div><div className="privacy-row"><LockKeyhole size={13}/> Private by design <span>·</span> Stored only in this session</div></div>
    </div>
    {error && <div className="error-banner">{error}</div>}
    <div className="upload-bottom"><span>WORKS WITH YOUR FILES</span><i><FileSpreadsheet size={14}/> Microsoft Excel</i><i><FileText size={14}/> CSV exports</i><i><FileText size={14}/> JSON records</i></div>
  </section>;
}
