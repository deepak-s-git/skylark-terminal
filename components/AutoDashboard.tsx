import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';


const COLORS = ['#D1F53B', '#FF4444', '#888888', '#444444', '#EEEEEE'];
const CHART_MARGIN = { top: 5, right: 5, left: -20, bottom: 5 };
const TICK_STYLE = { fill: '#888', fontSize: 10 };
const TOOLTIP_CURSOR = { fill: '#222' };
const TOOLTIP_STYLE = { backgroundColor: '#111', border: '1px solid #333', fontSize: '10px' };
const LEGEND_STYLE = { fontSize: '10px', paddingTop: '10px' };


export const AutoDashboard = ({ data }: { data: any }) => {
  const kpis: { label: string; value: any }[] = [];
  const charts: { title: string; data: any[]; xKey: string; yKeys: string[] }[] = [];
  const lists: { title: string; items: any[] }[] = [];

  const parseData = (obj: any, prefix = '') => {
    if (!obj || typeof obj !== 'object') return;

    Object.entries(obj).forEach(([key, value]) => {
      // Clean up the label name
      let cleanKey = key.replace(/_/g, ' ');
      const label = prefix ? `${prefix} // ${cleanKey}` : cleanKey;
      
      if (typeof value === 'number') {
        // Format numbers slightly if they are huge
        let formattedValue: string | number = value;
        if (value > 1000000) {
          formattedValue = `₹${(value / 10000000).toFixed(2)}Cr`;
        } else if (value % 1 !== 0) {
          formattedValue = value.toFixed(1);
        }
        kpis.push({ label, value: formattedValue });
      } else if (typeof value === 'string' && value.length < 50) {
        kpis.push({ label, value });
      } else if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'object') {
          const keys = Object.keys(value[0]);
          const xKey = keys.find(k => typeof value[0][k] === 'string' || k === 'name' || k === 'sector' || k === 'stage') || keys[0];
          const yKeys = keys.filter(k => typeof value[0][k] === 'number');
          
          if (yKeys.length > 0) {
            charts.push({ title: label, data: value, xKey, yKeys });
          } else {
            lists.push({ title: label, items: value });
          }
        } else if (value.length > 0 && typeof value[0] === 'string') {
          lists.push({ title: label, items: value });
        }
      } else if (typeof value === 'object') {
        parseData(value, label);
      }
    });
  };

  parseData(data);

  // If literally nothing parsed, just dump JSON
  if (kpis.length === 0 && charts.length === 0 && lists.length === 0) {
    return (
      <div className="w-full h-full bg-vanta text-chartreuse p-6 font-mono text-xs overflow-auto">
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col gap-6 fade-in">
      {/* Dynamic KPIs */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => (
            <div key={i} className="bento-card bg-titanium border border-bordercol p-5 hover:border-slateMuted transition-colors relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-bordercol group-hover:bg-chartreuse transition-colors"></div>
              <div className="text-[10px] text-slateMuted font-mono uppercase mb-3 truncate pl-2">{kpi.label}</div>
              <div className="text-2xl md:text-3xl font-mono text-ghost truncate pl-2">{kpi.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Dynamic Charts */}
      {charts.length > 0 && (
        <div className={`grid grid-cols-1 ${charts.length > 1 ? 'xl:grid-cols-2' : ''} gap-6 flex-1 min-h-[300px]`}>
          {charts.map((chart, i) => (
            <div key={i} className="bento-card bg-titanium border border-bordercol p-6 h-[350px] flex flex-col relative group hover:border-slateMuted transition-colors">
              <div className="text-[10px] text-chartreuse font-mono uppercase mb-6 tracking-widest truncate">
                <span className="text-vermilion mr-2">■</span> {chart.title}
              </div>
              <div className="flex-1 min-h-0 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart.data} margin={CHART_MARGIN}>
                    <XAxis dataKey={chart.xKey} stroke="#444" tick={TICK_STYLE} />
                    <YAxis stroke="#444" tick={TICK_STYLE} tickFormatter={(val) => val > 1000000 ? `${(val/10000000).toFixed(1)}Cr` : val} />
                    <Tooltip cursor={TOOLTIP_CURSOR} contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={LEGEND_STYLE} />
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
      
      {/* Dynamic Data Lists/Arrays */}
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
