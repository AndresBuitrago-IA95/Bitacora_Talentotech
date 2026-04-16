import React, { useState, useCallback, useMemo } from 'react';
import { Upload, FileCode, Search, Sparkles, Loader2, LogOut, User, ShieldCheck } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { NotebookRenderer } from './components/NotebookRenderer';
import { ExercisePanel } from './components/ExercisePanel';
import { LoginModal } from './components/LoginModal';
import { generateExercises, partitionDays } from './services/geminiService';
import { Notebook, DayContent, Exercise, NotebookCell } from './types';
import { cn } from './lib/utils';

export default function App() {
  const [userRole, setUserRole] = useState<'admin' | 'campista' | null>(null);
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [days, setDays] = useState<{ id: string; title: string; cellRange: [number, number] }[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [exercises, setExercises] = useState<Record<string, Exercise[]>>({});
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [completedDays, setCompletedDays] = useState<Set<string>>(new Set());

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const text = await file.text();
      const nb: Notebook = JSON.parse(text);
      setNotebook(nb);
      
      const partitioned = await partitionDays(nb.cells);
      setDays(partitioned);
      setSelectedDayId(partitioned[0]?.id || null);
    } catch (error) {
      console.error("Error parsing notebook:", error);
      alert("Error al procesar el archivo .ipynb. Asegúrate que sea un formato válido.");
    } finally {
      setIsUploading(false);
    }
  };

  const selectedDayCells = useMemo(() => {
    if (!notebook || !selectedDayId) return [];
    const day = days.find(d => d.id === selectedDayId);
    if (!day) return [];
    return notebook.cells.slice(day.cellRange[0], day.cellRange[1]);
  }, [notebook, selectedDayId, days]);

  const handleGenerateExercises = async () => {
    if (!selectedDayId || !selectedDayCells.length) return;
    
    setIsLoadingExercises(true);
    try {
      const generated = await generateExercises(selectedDayCells);
      setExercises(prev => ({ ...prev, [selectedDayId]: generated }));
    } finally {
      setIsLoadingExercises(false);
    }
  };

  const handleExerciseComplete = (exId: string, userCode: string, output: string) => {
    if (!selectedDayId) return;

    setExercises(prev => {
      const dayExs = prev[selectedDayId] || [];
      const updated = dayExs.map(ex => 
        ex.id === exId ? { ...ex, completed: true, userCode, output } : ex
      );
      
      // Check if all exercises are complete for this day
      if (updated.every(e => e.completed)) {
        setCompletedDays(prevSet => new Set([...prevSet, selectedDayId]));
      }

      return { ...prev, [selectedDayId]: updated };
    });
  };

  if (!userRole) {
    return <LoginModal onLogin={setUserRole} />;
  }

  return (
    <div className="flex h-screen bg-white text-zinc-900 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Sidebar 
        days={days} 
        selectedDayId={selectedDayId} 
        onSelectDay={setSelectedDayId}
        completedDays={completedDays}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full bg-white relative overflow-hidden">
        {/* Header / Top Bar */}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-10 bg-slate-900/50 backdrop-blur-xl z-10">
          <div className="flex flex-col">
             {selectedDayId ? (
               <>
                 <h1 className="text-xl font-bold tracking-tight text-white">
                   {days.find(d => d.id === selectedDayId)?.title}
                 </h1>
                 <p className="text-xs text-slate-500 font-medium">Bootcamp Python | Fundamentos</p>
               </>
             ) : (
               <div className="text-slate-500 text-sm font-medium tracking-wide">Sube un notebook para comenzar</div>
             )}
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end mr-4 text-right">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white uppercase tracking-wider">
                {userRole === 'admin' ? <ShieldCheck className="w-3.5 h-3.5 text-sky-400" /> : <User className="w-3.5 h-3.5 text-slate-400" />}
                {userRole === 'admin' ? "Administrador" : "Campista"}
              </div>
              <button 
                onClick={() => setUserRole(null)}
                className="text-[10px] text-slate-500 hover:text-red-400 transition-colors uppercase font-bold tracking-widest mt-0.5"
              >
                Cerrar Sesión
              </button>
            </div>

            {userRole === 'admin' && (
              <>
                <label className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  "bg-sky-400 text-slate-950 hover:bg-sky-300 hover:shadow-lg hover:shadow-sky-400/20 active:scale-[0.98]"
                )}>
                  <Upload className="w-4 h-4" />
                  <span>{isUploading ? "Subiendo..." : "Subir IPYNB"}</span>
                  <input type="file" accept=".ipynb" className="hidden" onChange={handleFileUpload} />
                </label>

                {selectedDayId && !exercises[selectedDayId] && (
                  <button
                    onClick={handleGenerateExercises}
                    disabled={isLoadingExercises}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white/5 text-white rounded-lg text-xs font-bold hover:bg-white/10 transition-all disabled:opacity-50 border border-white/5"
                  >
                    {isLoadingExercises ? (
                      <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-sky-400" />
                    )}
                    <span>Generar Ejercicios IA</span>
                  </button>
                )}
              </>
            )}
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto bg-[#0f172a]">
          {!notebook ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-xl mx-auto">
              <div className="w-24 h-24 rounded-[2rem] bg-slate-900 border border-white/5 flex items-center justify-center mb-8 shadow-2xl">
                <FileCode className="w-10 h-10 text-sky-400" />
              </div>
              <h2 className="text-4xl font-black tracking-tighter mb-4 text-white uppercase italic">Py-Logbook</h2>
              <p className="text-slate-400 mb-10 leading-relaxed font-medium">
                Transforma tus complejos cuadernos de Jupyter en una experiencia de aprendizaje interactiva y organizada.
              </p>
              <div className="grid grid-cols-2 gap-6 w-full">
                <div className="p-6 rounded-2xl bg-slate-900/50 border border-white/5 text-left group hover:border-sky-400/30 transition-all">
                  <div className="w-b h-8 rounded-lg bg-sky-400/10 flex items-center justify-center mb-4">
                    <Search className="w-4 h-4 text-sky-400" />
                  </div>
                  <h4 className="font-bold text-sm mb-1 text-slate-100">Organización</h4>
                  <p className="text-[11px] text-slate-500 font-medium">Dividimos tu contenido en secciones lógicas.</p>
                </div>
                <div className="p-6 rounded-2xl bg-slate-900/50 border border-white/5 text-left group hover:border-emerald-400/30 transition-all">
                  <div className="w-b h-8 rounded-lg bg-emerald-400/10 flex items-center justify-center mb-4">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h4 className="font-bold text-sm mb-1 text-slate-100">Retos IA</h4>
                  <p className="text-[11px] text-slate-500 font-medium">Generamos retos basados en el material.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-10 py-16">
              <NotebookRenderer cells={selectedDayCells} />
            </div>
          )}
        </main>
      </div>

      {/* Exercise Panel (Right Sidebar) */}
      <aside className="w-[450px] flex-shrink-0">
        <ExercisePanel 
          exercises={exercises[selectedDayId || ""] || []} 
          onComplete={handleExerciseComplete}
        />
      </aside>
    </div>
  );
}
