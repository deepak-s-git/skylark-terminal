import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

const COLORS = ['#D1F53B', '#333333', '#888888', '#FF4444', '#AAAAAA', '#DDDDDD'];

export const DataQualityWidget = ({ metrics }: { metrics: any }) => {
  if (!metrics?.deals || !metrics?.work_orders) return null;
  const data = [
    { name: 'Missing Value', Deals: metrics.deals.missing_deal_value, WOs: 0 },
    { name: 'Missing Date', Deals: metrics.deals.missing_close_date, WOs: 0 },
    { name: 'Missing Sector', Deals: metrics.deals.missing_sector, WOs: metrics.work_orders.missing_sector },
    { name: 'Missing Status', Deals: 0, WOs: metrics.work_orders.missing_execution_status },
  ];

  return (
    <div className="w-full h-full flex flex-col gap-4">
      <div className="bento-card bg-titanium border border-bordercol p-6">
        <h3 className="font-mono text-xs text-ghost mb-4 uppercase tracking-widest"><span className="text-vermilion">■</span> Data Hygiene Audit</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <XAxis type="number" stroke="#444" tick={{fill: '#888', fontSize: 10}} />
              <YAxis dataKey="name" type="category" stroke="#444" tick={{fill: '#888', fontSize: 10}} width={100} />
              <Tooltip cursor={{fill: '#222'}} contentStyle={{backgroundColor: '#111', border: '1px solid #333', color: '#D1F53B'}} />
              <Legend wrapperStyle={{fontSize: 10}} />
              <Bar dataKey="Deals" fill="#D1F53B" name="Sales Board (Deals)" />
              <Bar dataKey="WOs" fill="#888888" name="Ops Board (Work Orders)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bento-card bg-titanium border border-bordercol p-6">
          <div className="text-ghost font-mono text-xs mb-2">DEALS RECORDS</div>
          <div className="text-3xl font-mono text-chartreuse">{metrics.deals.total_records}</div>
          <div className="text-[10px] text-darkMuted mt-2">{metrics.deals.issues.length} critical issues detected</div>
        </div>
        <div className="bento-card bg-titanium border border-bordercol p-6">
          <div className="text-ghost font-mono text-xs mb-2">OPS RECORDS</div>
          <div className="text-3xl font-mono text-ghost">{metrics.work_orders.total_records}</div>
          <div className="text-[10px] text-darkMuted mt-2">{metrics.work_orders.issues.length} critical issues detected</div>
        </div>
      </div>
    </div>
  );
};

export const SectorPerformanceWidget = ({ metrics }: { metrics: any }) => {
  if (!metrics?.sectors) return null;
  const data = metrics.sectors.slice(0, 8); // Top 8
  
  return (
    <div className="w-full h-full flex flex-col gap-4">
      <div className="bento-card bg-titanium border border-bordercol p-6 h-80">
        <h3 className="font-mono text-xs text-ghost mb-4 uppercase tracking-widest"><span className="text-chartreuse">■</span> Sector Revenue Win/Loss</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <XAxis dataKey="sector" stroke="#444" tick={{fill: '#888', fontSize: 10}} />
            <YAxis stroke="#444" tick={{fill: '#888', fontSize: 10}} tickFormatter={(value: any) => `₹${(value/10000000).toFixed(1)}Cr`} />
            <Tooltip cursor={{fill: '#222'}} formatter={(value: any) => `₹${(Number(value)/10000000).toFixed(2)}Cr`} contentStyle={{backgroundColor: '#111', border: '1px solid #333'}} />
            <Legend wrapperStyle={{fontSize: 10}} />
            <Bar dataKey="won_value_inr" name="Won Revenue" fill="#D1F53B" />
            <Bar dataKey="open_pipeline_value_inr" name="Open Pipeline" fill="#444444" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const CrossBoardWidget = ({ metrics }: { metrics: any }) => {
  if (!metrics?.sector_comparison) return null;
  const data = metrics.sector_comparison;
  
  return (
    <div className="w-full h-full flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bento-card bg-titanium border border-bordercol p-6">
          <div className="text-ghost font-mono text-xs mb-2">MATCH RATE</div>
          <div className="text-4xl font-mono text-chartreuse">{metrics.match_rate_pct}%</div>
          <div className="text-[10px] text-slateMuted mt-2">{metrics.won_deals_with_work_order} mapped / {metrics.won_deal_count} won</div>
        </div>
        <div className="bento-card bg-titanium border border-bordercol p-6 border-l-4 border-l-vermilion">
          <div className="text-ghost font-mono text-xs mb-2">UNMAPPED WON DEALS</div>
          <div className="text-4xl font-mono text-vermilion">{metrics.won_deals_without_work_order}</div>
          <div className="text-[10px] text-slateMuted mt-2">Revenue leaking to un-invoiced operations</div>
        </div>
      </div>
      <div className="bento-card bg-titanium border border-bordercol p-6 h-80">
        <h3 className="font-mono text-xs text-ghost mb-4 uppercase tracking-widest"><span className="text-chartreuse">■</span> Revenue vs Contract Value</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <XAxis dataKey="sector" stroke="#444" tick={{fill: '#888', fontSize: 10}} />
            <YAxis stroke="#444" tick={{fill: '#888', fontSize: 10}} tickFormatter={(value: any) => `₹${(value/10000000).toFixed(1)}Cr`} />
            <Tooltip cursor={{fill: '#222'}} formatter={(value: any) => `₹${(Number(value)/10000000).toFixed(2)}Cr`} contentStyle={{backgroundColor: '#111', border: '1px solid #333'}} />
            <Legend wrapperStyle={{fontSize: 10}} />
            <Bar dataKey="won_value" name="Sales Won Revenue" fill="#D1F53B" />
            <Bar dataKey="wo_contract_value" name="Ops Contract Value" fill="#666666" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
