import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

const COLORS = ['#D1F53B', '#FF4444', '#888888', '#444444', '#EEEEEE'];
const CHART_MARGIN = { top: 15, right: 15, left: -10, bottom: 5 };
const TICK_STYLE = { fill: '#888', fontSize: 10 };
const TOOLTIP_CURSOR = { fill: '#222' };
const TOOLTIP_STYLE = { backgroundColor: '#111', border: '1px solid #333', fontSize: '10px', color: '#fff' };

const yAxisFormatter = (val: any) => val > 1000000 ? `₹${(val/10000000).toFixed(1)}Cr` : val;

export const AutoDashboard = ({ data }: { data: any }) => {
  
  const { kpis, charts, lists } = useMemo(() => {
    const k: { label: string; value: any }[] = [];
    const c: { title: string; data: any[]; xKey: string; yKeys: string[] }[] = [];
    const l: { title: string; items: any[] }[] = [];

    const parseData = (obj: any, prefix = '') => {
      if (!obj || typeof obj !== 'object') return;

      Object.entries(obj).forEach(([key, value]) => {
        let cleanKey = key.replace(/_/g, ' ');
        const label = prefix ? `${prefix} // ${cleanKey}` : cleanKey;
        
        if (typeof value === 'number') {
          let formattedValue: string | number = value;
          if (value > 1000000) {
            formattedValue = `₹${(value / 10000000).toFixed(2)}Cr`;
          } else if (value % 1 !== 0) {
            formattedValue = value.toFixed(1);
          }
          k.push({ label, value: formattedValue });
        } else if (typeof value === 'string' && value.length < 50) {
          k.push({ label, value });
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
          const isNumericDict = Object.keys(value).length > 0 && Object.values(value).every(v => typeof v === 'number');
          if (isNumericDict) {
            const arr = Object.entries(value).map(([k, v]) => ({ name: k, value: v }));
            c.push({ title: label, data: arr, xKey: 'name', yKeys: ['value'] });
          } else {
            parseData(value, label);
          }
        }
      });
    };

    parseData(data);
    return { kpis: k, charts: c, lists: l };
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
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {kpis.map((kpi, i) => (
            <div key={i} className="bento-card bg-titanium border border-bordercol p-3 hover:border-slateMuted transition-colors relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-bordercol group-hover:bg-chartreuse transition-colors"></div>
              <div className="text-[8px] text-slateMuted font-mono uppercase mb-1 truncate pl-2" title={kpi.label}>{kpi.label}</div>
              <div className="text-lg md:text-xl font-mono text-ghost truncate pl-2">{kpi.value}</div>
            </div>
          ))}
        </div>
      )}

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
                    <YAxis stroke="#444" tick={TICK_STYLE} tickFormatter={yAxisFormatter} />
                    <Tooltip cursor={TOOLTIP_CURSOR} contentStyle={TOOLTIP_STYLE} itemStyle={{fontSize: '10px'}} labelStyle={{color: '#888', marginBottom: '4px'}} />
                    {chart.yKeys.map((yk, idx) => (
                      <Bar key={yk} dataKey={yk} fill={COLORS[idx % COLORS.length]} name={yk.replace(/_/g, ' ').toUpperCase()} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {lists.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {lists.map((list, i) => (
            <div key={i} className="bento-card bg-titanium border border-bordercol p-5">
              <div className="text-[10px] text-ghost font-mono uppercase mb-4 tracking-widest border-b border-bordercol pb-2">
                {list.title}
              </div>
              <div className="max-h-48 overflow-y-auto custom-scrollbar font-mono text-[10px] text-slateMuted space-y-1">
                {list.items.map((item, idx) => (
                  <div key={idx} className="py-1 border-b border-bordercol/30">
                    {typeof item === 'string' ? item : JSON.stringify(item)}
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
