import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Upload, FileCode, Search, Sparkles, Loader2, LogOut, User, ShieldCheck } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { NotebookRenderer } from './components/NotebookRenderer';
import { ExercisePanel } from './components/ExercisePanel';
import { LoginModal } from './components/LoginModal';
import { generateExercises, partitionDays } from './services/geminiService';
import { Notebook, DayContent, Exercise, NotebookCell } from './types';
import { cn } from './lib/utils';
import { auth, db, logout } from './services/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  doc, onSnapshot, setDoc, updateDoc, 
  collection, getDocs, writeBatch, serverTimestamp, 
  getDoc, query, where, arrayUnion
} from 'firebase/firestore';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'campista' | null>(null);
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [days, setDays] = useState<{ id: string; title: string; order: number; cellRange: [number, number] }[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [dayContents, setDayContents] = useState<Record<string, NotebookCell[]>>({});
  const [exercises, setExercises] = useState<Record<string, Exercise[]>>({});
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const completedDays = useMemo(() => {
    const set = new Set<string>();
    Object.entries(exercises).forEach(([dayId, dayExs]) => {
      if (dayExs.length > 0 && dayExs.every(ex => ex.completed)) {
        set.add(dayId);
      }
    });
    return set;
  }, [exercises]);

  // Listen for Auth changes
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        // Auto-determine role if email matches admin
        if (u.email === 'andrezbuitrago82@gmail.com') {
          // If already logged in, we still might want the password confirmation 
          // but for persistence, let's allow it
          setUserRole('admin');
        } else {
          setUserRole('campista');
        }
      }
    });
  }, []);

  // Sync Global Bootcamp Data
  useEffect(() => {
    // 1. Sync Notebook Metadata
    const unsubMeta = onSnapshot(doc(db, 'config', 'notebook'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setNotebook({ cells: [], metadata: {} } as any); // Marker that we have a notebook
      } else {
        setNotebook(null);
      }
    });

    // 2. Sync Days list
    const unsubDays = onSnapshot(collection(db, 'days'), (snap) => {
      const daysList = snap.docs.map(d => d.data() as any).sort((a, b) => a.order - b.order);
      setDays(daysList);
      if (!selectedDayId && daysList.length > 0) setSelectedDayId(daysList[0].id);
    });

    return () => {
      unsubMeta();
      unsubDays();
    };
  }, [selectedDayId]);

  // Sync Current Day Content & Exercises
  useEffect(() => {
    if (!selectedDayId) return;

    const unsubContent = onSnapshot(doc(db, 'content', selectedDayId), (snap) => {
      if (snap.exists()) {
        setDayContents(prev => ({ ...prev, [selectedDayId]: snap.data().cells }));
      }
    });

    const unsubExs = onSnapshot(doc(db, 'exercises', selectedDayId), (snap) => {
      if (snap.exists()) {
        setExercises(prev => ({ ...prev, [selectedDayId]: snap.data().exercises }));
      }
    });

    return () => {
      unsubContent();
      unsubExs();
    };
  }, [selectedDayId]);

  // Sync User Progress
  useEffect(() => {
    if (!user) return;

    const unsubProgress = onSnapshot(collection(db, 'users', user.uid, 'progress'), (snap) => {
      const completedIds = snap.docs.filter(d => d.data().completed).map(d => d.id);
      
      // Update exercises status based on progress
      setExercises(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(dayId => {
          next[dayId] = next[dayId].map(ex => ({
            ...ex,
            completed: completedIds.includes(ex.id) || ex.completed
          }));
        });
        return next;
      });

      // Update completed days (if all day exercises are in completedIds)
      // This is a bit complex in real-time, but let's approximate
    });

    return () => unsubProgress();
  }, [user]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || userRole !== 'admin') return;

    setIsUploading(true);
    try {
      const text = await file.text();
      const nb: Notebook = JSON.parse(text);
      const partitioned = await partitionDays(nb.cells);

      // Persist to Firestore
      const batch = writeBatch(db);
      
      // Update metadata
      batch.set(doc(db, 'config', 'notebook'), {
        title: file.name,
        lastUpdated: serverTimestamp(),
        totalDays: partitioned.length
      });

      // Clear old days (simulated by overwriting or resetting manually if needed)
      // Here we replace them
      partitioned.forEach((day, index) => {
        const dayId = `day-${index + 1}`;
        batch.set(doc(db, 'days', dayId), { ...day, id: dayId, order: index });
        
        // Split cells per day
        const cells = nb.cells.slice(day.cellRange[0], day.cellRange[1]);
        batch.set(doc(db, 'content', dayId), { cells });
      });

      await batch.commit();
      
      setNotebook(nb);
      const daysWithOrder = partitioned.map((day, index) => ({ ...day, order: index }));
      setDays(daysWithOrder);
      setSelectedDayId(`day-1`);
    } catch (error) {
      console.error("Error persistenting notebook:", error);
      alert("Error al procesar y guardar el notebook.");
    } finally {
      setIsUploading(false);
    }
  };

  const selectedDayCells = useMemo(() => {
    return dayContents[selectedDayId || ""] || [];
  }, [dayContents, selectedDayId]);

  const handleGenerateExercises = async () => {
    if (!selectedDayId || !selectedDayCells.length) return;
    
    setIsLoadingExercises(true);
    try {
      const generated = await generateExercises(selectedDayCells);
      await setDoc(doc(db, 'exercises', selectedDayId), { exercises: generated });
    } catch (err) {
      console.error("Error generating/saving exercises:", err);
    } finally {
      setIsLoadingExercises(false);
    }
  };

  const handleExerciseComplete = async (exId: string, userCode: string, output: string) => {
    if (!selectedDayId || !user) return;

    // Local update for UI snappiness
    setExercises(prev => {
      const dayExs = prev[selectedDayId] || [];
      const updated = dayExs.map(ex => 
        ex.id === exId ? { ...ex, completed: true } : ex
      );
      return { ...prev, [selectedDayId]: updated };
    });

    // Persistent update for user progress
    try {
      await setDoc(doc(db, 'users', user.uid, 'progress', exId), {
        completed: true,
        userCode,
        output,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Error saving progress:", err);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUserRole(null);
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
                onClick={handleLogout}
                className="text-[10px] text-slate-500 hover:text-red-400 transition-colors uppercase font-bold tracking-widest mt-0.5"
              >
                Cerrar Sesión
              </button>
            </div>

            {userRole === 'admin' && (
              <label className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                "bg-sky-400 text-slate-950 hover:bg-sky-300 hover:shadow-lg hover:shadow-sky-400/20 active:scale-[0.98]"
              )}>
                <Upload className="w-4 h-4" />
                <span>{isUploading ? "Subiendo..." : "Subir IPYNB"}</span>
                <input type="file" accept=".ipynb" className="hidden" onChange={handleFileUpload} />
              </label>
            )}

            {selectedDayId && !exercises[selectedDayId] && (
              <button
                onClick={handleGenerateExercises}
                disabled={isLoadingExercises}
                className="flex items-center gap-2 px-5 py-2.5 bg-white/5 text-white rounded-lg text-xs font-bold hover:bg-white/10 transition-all disabled:opacity-50 border border-white/5 shadow-xl shadow-sky-500/5 group"
              >
                {isLoadingExercises ? (
                  <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                ) : (
                  <Sparkles className="w-4 h-4 text-sky-400 group-hover:scale-125 transition-transform" />
                )}
                <div className="flex flex-col items-start leading-none gap-1">
                  <span className="text-[10px] font-black uppercase tracking-widest">{isLoadingExercises ? "Generando..." : "Sugerir Retos IA"}</span>
                  {!isLoadingExercises && <span className="text-[8px] text-slate-500 font-bold uppercase">Basado en el material</span>}
                </div>
              </button>
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
