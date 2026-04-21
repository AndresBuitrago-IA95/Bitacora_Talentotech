import React from 'react';
import { cn } from '../lib/utils';
import { Calendar, CheckCircle2, BookOpen, Trash2, Edit2 } from 'lucide-react';

interface SidebarProps {
  days: { id: string; title: string }[];
  selectedDayId: string | null;
  onSelectDay: (id: string) => void;
  onDeleteDay?: (id: string) => void;
  onRenameDay?: (id: string, newTitle: string) => void;
  completedDays: Set<string>;
  isAdmin?: boolean;
  groupName?: string;
}

export function Sidebar({ days, selectedDayId, onSelectDay, onDeleteDay, onRenameDay, completedDays, isAdmin, groupName }: SidebarProps) {
  return (
    <div className="w-64 lg:w-72 h-full bg-slate-900 border-r border-white/10 flex flex-col shadow-2xl">
      <div className="p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="text-xl font-black tracking-tighter text-sky-400 italic">
            PY-LOGBOOK
          </div>
        </div>

        {groupName && (
          <div className="mb-8 px-1">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">GRUPO</div>
            <div className="text-xs font-bold text-sky-400/80 truncate">{groupName}</div>
          </div>
        )}
        
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-6 px-1">
          NAVEGACIÓN
        </h3>
        
        <nav className="space-y-1">
          {days.map((day) => (
            <button
              key={day.id}
              onClick={() => onSelectDay(day.id)}
              className={cn(
                "w-full text-left px-4 py-3 border-l-3 transition-all duration-200 flex items-center justify-between group",
                selectedDayId === day.id 
                  ? "bg-sky-400/10 text-slate-50 border-sky-400" 
                  : "text-slate-400 border-transparent hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  completedDays.has(day.id) ? "bg-emerald-500" : "bg-transparent border border-slate-600"
                )} />
                <span className="text-sm font-medium truncate max-w-[140px]">
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
                    className="p-1.5 hover:bg-sky-500/20 text-slate-500 hover:text-sky-400 rounded-md"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {isAdmin && onDeleteDay && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`¿Estás seguro de eliminar el "${day.title}"? Esta acción no se puede deshacer.`)) {
                        onDeleteDay(day.id);
                      }
                    }}
                    className="p-1.5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </button>
          ))}
        </nav>
      </div>
      
      <div className="mt-auto p-6 bg-slate-950/20">
        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Progreso Bootcamp</div>
        <div className="mt-3 h-1 w-full bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-sky-400 transition-all duration-500 shadow-[0_0_8px_rgba(56,189,248,0.5)]" 
            style={{ width: `${days.length > 0 ? (completedDays.size / days.length) * 100 : 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}
