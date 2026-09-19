import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, ResponsiveContainer as RC } from 'recharts';

const COLORS = ['#D1F53B', '#FF4444', '#888888', '#444444', '#EEEEEE', '#FF007F', '#00F0FF'];
const CHART_MARGIN = { top: 15, right: 15, left: -10, bottom: 5 };
const TICK_STYLE = { fill: '#888', fontSize: 10 };
const TOOLTIP_CURSOR = { fill: '#222' };
const TOOLTIP_STYLE = { backgroundColor: '#111', border: '1px solid #333', fontSize: '10px', color: '#fff' };

const formatVal = (val: any) => {
  if (typeof val !== 'number') return val;
  if (val > 1000000) return `₹${(val/10000000).toFixed(1)}Cr`;
  if (val % 1 !== 0) return val.toFixed(1);
  return val;
};

export const AutoDashboard = ({ data }: { data: any }) => {
  
  const { kpis, charts, lists, pies } = useMemo(() => {
    const k: { label: string; value: any; isPercentage: boolean }[] = [];
    const c: { title: string; data: any[]; xKey: string; yKeys: string[] }[] = [];
    const p: { title: string; data: any[] }[] = [];
    const l: { title: string; items: any[] }[] = [];

    const parseData = (obj: any, prefix = '') => {
      if (!obj || typeof obj !== 'object') return;

      // VISUAL INJECTION: If an object has multiple numeric keys, automatically spawn a PieChart/BarChart for it
      // This guarantees visual charts for things like data_quality or isolated sector stats!
      if (!Array.isArray(obj)) {
        const numKeys = Object.keys(obj).filter(key => typeof obj[key] === 'number');
        if (numKeys.length >= 2) {
          const arr = numKeys.map(key => ({ name: key.replace(/_/g, ' ').toUpperCase(), value: obj[key] }));
          // If values are wildly different (e.g. money vs count), a BarChart with log scale or just raw bars is fine.
          // We push it as a special Pie/Bar component.
          c.push({ 
            title: prefix ? `${prefix} // VISUALIZED` : 'METRICS VISUALIZED', 
            data: arr, 
            xKey: 'name', 
            yKeys: ['value'] 
          });
        }
      }

      Object.entries(obj).forEach(([key, value]) => {
        let cleanKey = key.replace(/_/g, ' ');
        const label = prefix ? `${prefix} // ${cleanKey}` : cleanKey;
        
        if (typeof value === 'number') {
          const isPercentage = key.toLowerCase().includes('pct') || key.toLowerCase().includes('rate');
          k.push({ label, value: formatVal(value), isPercentage });
        } else if (typeof value === 'string' && value.length < 50) {
          k.push({ label, value, isPercentage: false });
        } else if (Array.isArray(value)) {
          if (value.length > 0 && typeof value[0] === 'object') {
            const keys = Object.keys(value[0]);
            const xKey = keys.find(k => typeof value[0][k] === 'string' || k === 'name' || k === 'sector' || k === 'stage') || keys[0];
            const yKeys = keys.filter(k => typeof value[0][k] === 'number');
            
            if (yKeys.length > 0) {
              c.push({ title: label, data: value, xKey, yKeys });
            } else {
              l.push({ title: label, items: value });
            }
          } else if (value.length > 0 && typeof value[0] === 'string') {
            l.push({ title: label, items: value });
          }
        } else if (value !== null && typeof value === 'object') {
          parseData(value, label);
        }
      });
    };

    parseData(data);
    
    // Deduplicate charts by title/data signature to prevent spam
    const uniqueCharts = c.filter((chart, index, self) =>
      index === self.findIndex((t) => (
        t.title === chart.title && t.data.length === chart.data.length
      ))
    );

    return { kpis: k, charts: uniqueCharts, lists: l, pies: p };
  }, [data]);

  if (kpis.length === 0 && charts.length === 0 && lists.length === 0) {
    return (
      <div className="w-full h-full bg-vanta text-chartreuse p-6 font-mono text-xs overflow-auto">
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6 fade-in">
      {/* KPIs Grid */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {kpis.map((kpi, i) => (
            <div key={i} className="bento-card bg-titanium border border-bordercol p-4 hover:border-slateMuted transition-colors relative overflow-hidden group flex flex-col justify-between h-[90px]">
              <div className="absolute top-0 left-0 w-1 h-full bg-bordercol group-hover:bg-chartreuse transition-colors"></div>
              <div className="text-[9px] text-slateMuted font-mono uppercase truncate pl-2" title={kpi.label}>{kpi.label}</div>
              
              <div className="flex items-end justify-between pl-2 w-full">
                <div className="text-xl md:text-2xl font-mono text-ghost truncate">{kpi.value}</div>
                {kpi.isPercentage && (
                  <div className="h-6 w-6 rounded-full border-[3px] border-chartreuse/20 flex items-center justify-center relative shadow-[0_0_10px_rgba(209,245,59,0.2)]">
                    <div className="absolute inset-0 rounded-full border-[3px] border-chartreuse" style={{ clipPath: 'polygon(50% 0%, 100% 0, 100% 100%, 0 100%, 0 0, 50% 0)', transform: `rotate(${Math.random() * 360}deg)` }}></div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dynamic Charts Grid */}
      {charts.length > 0 && (
        <div className={`grid grid-cols-1 ${charts.length > 1 ? 'xl:grid-cols-2' : ''} gap-6`}>
          {charts.map((chart, i) => (
            <div key={i} className="bento-card bg-titanium border border-bordercol p-6 h-[320px] flex flex-col relative group hover:border-slateMuted transition-colors">
              <div className="text-[10px] text-chartreuse font-mono uppercase mb-4 tracking-widest truncate">
                <span className="text-vermilion mr-2">■</span> {chart.title}
              </div>
              <div className="flex-1 min-h-0 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart.data} margin={CHART_MARGIN}>
                    <XAxis dataKey={chart.xKey} stroke="#444" tick={TICK_STYLE} />
                    <YAxis stroke="#444" tick={TICK_STYLE} tickFormatter={formatVal} />
                    <Tooltip cursor={TOOLTIP_CURSOR} contentStyle={TOOLTIP_STYLE} itemStyle={{fontSize: '10px'}} labelStyle={{color: '#888', marginBottom: '4px'}} formatter={(val: any) => formatVal(val)} />
                    {chart.yKeys.map((yk, idx) => (
                      <Bar key={yk} dataKey={yk} fill={COLORS[idx % COLORS.length]} name={yk.replace(/_/g, ' ').toUpperCase()} radius={[2, 2, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Dynamic Lists Grid */}
      {lists.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {lists.map((list, i) => (
            <div key={i} className="bento-card bg-titanium border border-bordercol p-5">
              <div className="text-[10px] text-ghost font-mono uppercase mb-4 tracking-widest border-b border-bordercol pb-2">
                {list.title}
              </div>
              <div className="max-h-48 overflow-y-auto custom-scrollbar font-mono text-[10px] text-slateMuted space-y-1">
                {list.items.map((item, idx) => (
                  <div key={idx} className="py-1 border-b border-bordercol/30 flex items-start gap-2">
                    <span className="text-vermilion mt-[2px]">▹</span> 
                    <span>{typeof item === 'string' ? item : JSON.stringify(item)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
