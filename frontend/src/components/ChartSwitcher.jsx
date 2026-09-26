import React from 'react';
import { Activity, BarChart3, Box, CircleDot, PieChart, Table2 } from 'lucide-react';

const views = [['table', Table2, 'Table'], ['bar', BarChart3, 'Bar'], ['pie', PieChart, 'Pie'], ['line', Activity, 'Line'], ['scatter', CircleDot, 'Scatter'], ['boxplot', Box, 'Boxplot']];

export default function ChartSwitcher({ value, onChange, compact = false }) {
  return <div className={`chart-switcher ${compact ? 'compact' : ''}`} role="tablist" aria-label="Result visualization">
    {views.map(([type, Icon, label]) => <button role="tab" aria-selected={value === type} className={value === type ? 'chosen' : ''} key={type} onClick={() => onChange(type)} title={`${label} view`}><Icon size={14}/><span>{label}</span></button>)}
  </div>;
}
