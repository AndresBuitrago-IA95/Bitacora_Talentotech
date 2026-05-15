import React from 'react';
import { cn } from '../lib/utils';
import { Calendar, CheckCircle2, BookOpen, Trash2, Edit2, FileText, ChevronRight, Monitor, Image } from 'lucide-react';
import { Resource } from '../types';

interface SidebarProps {
  days: { id: string; title: string; sourceFile?: string }[];
  resources: Resource[];
  selectedDayId: string | null;
  selectedResourceId: string | null;
  onSelectDay: (id: string) => void;
  onSelectResource: (id: string) => void;
  onDeleteDay?: (id: string) => void;
  onDeleteResource?: (id: string) => void;
  onRenameDay?: (id: string, newTitle: string) => void;
  completedDays: Set<string>;
  isAdmin?: boolean;
  groupName?: string;
}

function DeleteButton({ onDelete, isSelected }: { onDelete: () => void; isSelected: boolean }) {
  const [isConfirming, setIsConfirming] = React.useState(false);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (isConfirming) {
          onDelete();
          setIsConfirming(false);
        } else {
          setIsConfirming(true);
          setTimeout(() => setIsConfirming(false), 3000);
        }
      }}
      className={cn(
        "p-1.5 rounded-lg transition-all duration-300 flex items-center justify-center gap-1 min-w-[28px]",
        isConfirming 
          ? "bg-red-500 text-white shadow-lg shadow-red-500/30 scale-105" 
          : isSelected 
            ? "bg-black/20 text-slate-900 hover:bg-red-500 hover:text-white" 
            : "text-slate-500 hover:text-red-400 hover:bg-red-500/10"
      )}
      title={isConfirming ? "Clic para confirmar" : "Eliminar"}
    >
      <Trash2 className={cn("transition-transform", isConfirming ? "w-2.5 h-2.5 scale-110" : "w-3 h-3")} />
      {isConfirming && <span className="text-[7px] font-black uppercase tracking-tighter">OK</span>}
    </button>
  );
}

export function Sidebar({ 
  days, 
  resources, 
  selectedDayId, 
  selectedResourceId, 
  onSelectDay, 
  onSelectResource, 
  onDeleteDay, 
  onDeleteResource, 
  onRenameDay, 
  completedDays, 
  isAdmin, 
  groupName 
}: SidebarProps) {
  // Group days by sourceFile
  const groupedDays = React.useMemo(() => {
    const groups: Record<string, typeof days> = {};
    days.forEach(day => {
      const source = day.sourceFile || "Principal";
      if (!groups[source]) groups[source] = [];
      groups[source].push(day);
    });
    return groups;
  }, [days]);

  return (
    <div className="w-64 lg:w-72 h-full bg-slate-950 border-r border-white/5 flex flex-col shadow-2xl relative overflow-hidden">
      {/* Visual background accents */}
      <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none" />
      
      <div className="flex-1 overflow-y-auto relative z-10 custom-scrollbar">
        <div className="p-5 lg:p-6">
          <div className="flex items-center justify-between gap-2 mb-6">
            <div className="text-xl font-black tracking-tighter text-white italic group flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-400 flex items-center justify-center text-slate-950 not-italic transform -rotate-12 group-hover:rotate-0 transition-transform">
                <BookOpen className="w-5 h-5" />
              </div>
              PY-LOGBOOK
            </div>
          </div>

          {groupName && (
            <div className="mb-8 px-2 py-3 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-md">
              <div className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 mb-1 font-mono">GRUPO ACTUAL</div>
              <div className="text-xs font-bold text-sky-400 truncate flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                {groupName}
              </div>
            </div>
          )}
          
          <div className="space-y-10">
            {/* Days Section */}
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-6 px-2 flex items-center justify-between border-b border-white/5 pb-2">
                CONTENIDO {days.length > 0 && <span className="text-sky-400/50">{days.length}</span>}
              </h3>
              
              <div className="space-y-8">
                {Object.entries(groupedDays).map(([source, items]) => (
                  <div key={source} className="space-y-3">
                    {Object.keys(groupedDays).length > 1 && (
                      <div className="px-2 flex items-center gap-2">
                        <div className="h-[1px] flex-1 bg-white/5" />
                        <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest truncate max-w-[120px]">{source}</span>
                        <div className="h-[1px] flex-1 bg-white/5" />
                      </div>
                    )}
                    
                    <nav className="space-y-1">
                      {items.map((day) => (
                        <button
                          key={day.id}
                          onClick={() => onSelectDay(day.id)}
                          className={cn(
                            "w-full text-left px-4 py-2.5 rounded-xl border-l-[3px] transition-all duration-300 flex items-center justify-between group relative h-11",
                            selectedDayId === day.id 
                              ? "bg-sky-400/10 text-white border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.1)]" 
                              : "text-slate-400 border-transparent hover:bg-white/5 hover:text-slate-200"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full transition-all duration-300",
                              completedDays.has(day.id) 
                                ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] scale-125" 
                                : "bg-slate-700"
                            )} />
                            <span className={cn(
                              "text-xs transition-all duration-300 truncate max-w-[140px]",
                              selectedDayId === day.id ? "font-bold" : "font-medium"
                            )}>
                              {day.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            {isAdmin && onRenameDay && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newTitle = prompt("Nuevo nombre del contenido:", day.title);
                                  if (newTitle && newTitle.trim() && newTitle !== day.title) {
                                    onRenameDay(day.id, newTitle.trim());
                                  }
                                }}
                                className="p-1.5 hover:bg-sky-400/20 text-slate-500 hover:text-sky-400 rounded-md transition-colors"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            )}
                            {isAdmin && onDeleteDay && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`¿Estás seguro de eliminar el "${day.title}"?`)) {
                                    onDeleteDay(day.id);
                                  }
                                }}
                                className="p-1.5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded-md transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </button>
                      ))}
                    </nav>
                  </div>
                ))}
              </div>
              
              {days.length === 0 && (
                <div className="p-8 rounded-2xl border border-dashed border-white/5 flex flex-col items-center justify-center gap-3 text-slate-600">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 opacity-40" />
                  </div>
                  <p className="text-[10px] font-bold text-center uppercase tracking-widest leading-loose">Sube un notebook para comenzar</p>
                </div>
              )}
            </div>

            {/* Resources Section */}
            {(resources.length > 0 || isAdmin) && (
              <div className="pt-8 border-t border-white/5">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-6 px-2 flex items-center justify-between border-b border-white/5 pb-2">
                  EXPLORA {resources.length > 0 && <span className="text-emerald-400/50">{resources.length}</span>}
                </h3>
                
                {resources.length === 0 ? (
                  <div className="p-8 rounded-2xl border border-dashed border-emerald-500/10 flex flex-col items-center justify-center gap-3 text-slate-600 bg-emerald-500/[0.02]">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/5 flex items-center justify-center">
                      <FileText className="w-5 h-5 opacity-40" />
                    </div>
                    <p className="text-[10px] font-bold text-center uppercase tracking-widest leading-loose">Buzón de material vacío</p>
                  </div>
                ) : (
                  <nav className="space-y-1">
                  {resources.map((res) => (
                    <button
                      key={res.id}
                      onClick={() => onSelectResource(res.id)}
                      className={cn(
                        "w-full text-left px-4 py-2.5 rounded-xl transition-all duration-300 flex items-center justify-between group h-11",
                        selectedResourceId === res.id 
                          ? "bg-emerald-500 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.2)] font-bold scale-[1.02]" 
                          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {(() => {
                          const Icon = res.type === 'pdf' ? BookOpen : 
                                       res.type === 'image' ? Image : 
                                       res.type === 'pptx' ? Monitor : 
                                       FileText;
                          return <Icon className={cn(
                            "w-3.5 h-3.5 transition-colors",
                            selectedResourceId === res.id ? "text-slate-950" : "text-slate-500 group-hover:text-emerald-400"
                          )} />;
                        })()}
                        <span className="text-[11px] truncate max-w-[130px] font-bold uppercase tracking-tight">
                          {res.title}
                        </span>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center ml-2">
                          <DeleteButton onDelete={() => onDeleteResource?.(res.id)} isSelected={selectedResourceId === res.id} />
                        </div>
                      )}
                    </button>
                  ))}
                </nav>
              )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="mt-auto p-5 lg:p-6 bg-white/[0.02] border-t border-white/5 backdrop-blur-md relative overflow-hidden">
        <div className="absolute inset-0 bg-sky-500/5 animate-pulse pointer-events-none" />
        <div className="flex items-center justify-between mb-3">
          <div className="text-[9px] text-slate-500 font-black uppercase tracking-wider">PROGRESO DEL CURSO</div>
          <div className="text-[10px] text-sky-400 font-black font-mono">
            {days.length > 0 ? Math.round((completedDays.size / days.length) * 100) : 0}%
          </div>
        </div>
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-sky-400 transition-all duration-700 ease-out shadow-[0_0_8px_rgba(56,189,248,0.5)] relative" 
            style={{ width: `${days.length > 0 ? (completedDays.size / days.length) * 100 : 0}%` }}
          >
            <div className="absolute inset-0 bg-white/20 animate-shimmer" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', backgroundSize: '200% 100%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
