import React, { useState } from 'react';
import { Exercise } from '../types';
import { runPythonCode } from '../services/pythonRunner';
import { Play, CheckCircle2, Circle, ChevronRight, XCircle, Info, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface ExercisePanelProps {
  exercises: Exercise[];
  onComplete: (exerciseId: string, userCode: string, output: string) => void;
}

export function ExercisePanel({ exercises, onComplete }: ExercisePanelProps) {
  const [activeExId, setActiveExId] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { output: string; error?: string }>>({});
  const [isRunning, setIsRunning] = useState(false);

  // Auto-select first exercise when list changes
  React.useEffect(() => {
    if (exercises.length > 0 && !activeExId) {
      setActiveExId(exercises[0].id);
    }
  }, [exercises, activeExId]);

  const handleRun = async (ex: Exercise) => {
    setIsRunning(true);
    const code = codes[ex.id] || "";
    const result = await runPythonCode(code);
    setResults(prev => ({ ...prev, [ex.id]: result }));
    setIsRunning(false);
    
    // Auto-complete if no error and some output (simplified logic)
    if (!result.error && result.output.length > 0) {
      onComplete(ex.id, code, result.output);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0f172a] border-l border-white/5 overflow-hidden">
      <div className="p-8 border-b border-white/5 bg-slate-900/40">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
          Ejercicio Propuesto
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {exercises.map((ex) => (
          <div 
            key={ex.id}
            className={cn(
              "group rounded-xl border transition-all duration-300 overflow-hidden",
              activeExId === ex.id ? "bg-slate-800/40 border-sky-400/30 shadow-2xl shadow-sky-950/20" : "bg-slate-900/30 border-white/5 hover:border-white/10"
            )}
          >
            <button
              onClick={() => setActiveExId(activeExId === ex.id ? null : ex.id)}
              className="w-full text-left p-5 flex items-start justify-between gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {ex.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-slate-700" />
                  )}
                  <h3 className={cn(
                    "font-bold text-sm tracking-tight",
                    ex.completed ? "text-emerald-400" : "text-slate-100"
                  )}>
                    {ex.title}
                  </h3>
                </div>
              </div>
            </button>

            <AnimatePresence>
              {activeExId === ex.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-5 pb-5 space-y-6 overflow-hidden border-t border-white/5 pt-5"
                >
                  <div className="bg-sky-400/5 rounded-lg p-4 border border-sky-400/10">
                    <p className="text-sm text-sky-100 leading-relaxed font-medium">
                      {ex.description}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-black/60 rounded-xl overflow-hidden border border-white/5">
                      <div className="bg-white/5 px-4 py-2 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Python 3.10 | Editor</span>
                        <div className="flex gap-1.5">
                           <div className="w-2 h-2 rounded-full bg-slate-700" />
                           <div className="w-2 h-2 rounded-full bg-slate-700" />
                           <div className="w-2 h-2 rounded-full bg-slate-700" />
                        </div>
                      </div>
                      <textarea
                        value={codes[ex.id] || ""}
                        onChange={(e) => setCodes(prev => ({ ...prev, [ex.id]: e.target.value }))}
                        placeholder="# Escribe tu solución aquí..."
                        className="w-full h-48 p-6 font-mono text-sm bg-transparent text-sky-100 outline-none resize-none placeholder:text-slate-700"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => handleRun(ex)}
                        disabled={isRunning}
                        className="flex-1 flex items-center justify-center gap-2 bg-sky-400 text-slate-950 px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-sky-300 transition-all active:scale-[0.98] disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        {isRunning ? "Ejecutando..." : "Ejecutar Código"}
                      </button>
                      <button
                        onClick={() => onComplete(ex.id, codes[ex.id] || "", results[ex.id]?.output || "")}
                        className={cn(
                          "flex-1 px-4 py-2.5 rounded-lg text-sm font-bold transition-all",
                          ex.completed 
                            ? "bg-emerald-500 text-white cursor-default" 
                            : "bg-white/5 text-slate-200 hover:bg-white/10 border border-white/5"
                        )}
                      >
                        {ex.completed ? "Completado" : "Marcar Completado"}
                      </button>
                    </div>
                  </div>

                  {(results[ex.id]?.output || results[ex.id]?.error) && (
                    <div className={cn(
                      "rounded-lg p-5 font-mono text-xs border animate-in fade-in slide-in-from-top-2",
                      results[ex.id]?.error ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-black/40 text-slate-300 border-white/5"
                    )}>
                      {results[ex.id]?.error ? (
                        <pre className="whitespace-pre-wrap">{results[ex.id]?.error}</pre>
                      ) : (
                        <pre className="whitespace-pre-wrap">{results[ex.id]?.output || "Output exitoso"}</pre>
                      )}
                    </div>
                  )}

                  <div className="text-slate-500 text-[10px] font-medium uppercase tracking-wider flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-sky-400" />
                    Tip: {ex.solution_hint}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
        {exercises.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-40 px-4">
            <Sparkles className="w-10 h-10 text-slate-700 mb-4" />
            <p className="text-slate-500 text-sm font-medium tracking-tight">
              Sube un notebook y haz clic en "Generar Ejercicios IA" para comenzar a practicar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
