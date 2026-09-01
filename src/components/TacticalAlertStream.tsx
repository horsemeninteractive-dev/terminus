import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Crosshair, Droplets, Info, Sparkles, Users, X } from 'lucide-react';

export interface TacticalAlert {
 id: string;
 title: string;
 desc: string;
 type: 'danger' | 'warn' | 'info' | 'success';
 timestamp: number;
 onClick?: () => void;
}

interface TacticalAlertStreamProps {
 alerts: TacticalAlert[];
 onDismiss: (id: string) => void;
}

export const TacticalAlertStream: React.FC<TacticalAlertStreamProps> = ({ alerts = [], onDismiss }) => {
 if (!alerts || alerts.length === 0) return null;

 return (
 <div
 id="tactical-alert-stream"      className="flex flex-col gap-1.5 pointer-events-auto w-72 select-none"
 >
 {alerts.slice(0, 5).map((alert) => {
 const isDanger = alert.type === 'danger';
 const isWarn = alert.type === 'warn';
 const isSuccess = alert.type === 'success';

 return (
 <div
 key={alert.id}
 onClick={alert.onClick}
 className={`flex items-start gap-2 p-2 border transition-all duration-200 cursor-pointer clip-card-chip ${
 isDanger
 ? 'bg-[#180B0D] border-[#B31217] text-[#FF9B9B] animate-pulse'
 : isWarn
 ? 'bg-[#1A140B] border-[#78350F] text-[#FDE68A]'
 : isSuccess
 ? 'bg-[#0B1710] border-[#065F46] text-[#A7F3D0]'
 : 'bg-[#0E1116] border-[#252C36] text-[#CBD5E1]'
 }`}
 >
 {/* Alert Icon */}
 <div className="shrink-0 mt-0.5">
 {isDanger ? (
 <Crosshair className="w-3.5 h-3.5 text-[#B31217]" />
 ) : isWarn ? (
 <AlertTriangle className="w-3.5 h-3.5 text-[#D97706]" />
 ) : isSuccess ? (
 <CheckCircle className="w-3.5 h-3.5 text-[#10B981]" />
 ) : (
 <Info className="w-3.5 h-3.5 text-[#CBD5E1]" />
 )}
 </div>

 {/* Alert Content */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-1">
 <span className="font-heading font-bold text-[11px] uppercase tracking-wider truncate">
 {alert.title}
 </span>
 <button
 onClick={(e) => {
 e.stopPropagation();
 onDismiss(alert.id);
 }}
 className="text-[#64748B] hover:text-[#E8E8E8] transition-colors p-0.5"
 >
 <X className="w-3 h-3" />
 </button>
 </div>
 <p className="text-[10px] font-mono leading-tight text-[#94A3B8] mt-0.5 line-clamp-2">
 {alert.desc}
 </p>
 </div>
 </div>
 );
 })}
 </div>
 );
};
