import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Upload, FileCode, Search, Sparkles, Loader2, LogOut, User, ShieldCheck, Menu, X, BookOpen, Code2 } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { NotebookRenderer } from './components/NotebookRenderer';
import { ExercisePanel } from './components/ExercisePanel';
import { LoginModal } from './components/LoginModal';
import { AdminManagementModal } from './components/AdminManagementModal';
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
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string>('');
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [days, setDays] = useState<{ id: string; title: string; order: number; cellRange: [number, number] }[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [dayContents, setDayContents] = useState<Record<string, NotebookCell[]>>({});
  const [exercises, setExercises] = useState<Record<string, Exercise[]>>({});
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  // Mobile states
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'content' | 'exercises'>('content');

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
      // We no longer auto-set role here without group selection
      // But we can reset if u is gone
      if (!u) {
        setUserRole(null);
        setSelectedGroupId(null);
      }
    });
  }, []);

  // Sync Global Bootcamp Data scoped by group
  useEffect(() => {
    if (!selectedGroupId) {
      setNotebook(null);
      setDays([]);
      setSelectedDayId(null);
      return;
    }

    // 0. Fetch Group Name
    getDoc(doc(db, 'groups', selectedGroupId)).then(snap => {
      if (snap.exists()) setGroupName(snap.data().name);
    });

    // 1. Sync Notebook Metadata
    const unsubMeta = onSnapshot(doc(db, 'groups', selectedGroupId, 'config', 'notebook'), (snap) => {
      if (snap.exists()) {
        setNotebook({ cells: [], metadata: {} } as any); 
      } else {
        setNotebook(null);
      }
    });

    // 2. Sync Days list
    const unsubDays = onSnapshot(collection(db, 'groups', selectedGroupId, 'days'), (snap) => {
      const daysList = snap.docs.map(d => d.data() as any).sort((a, b) => a.order - b.order);
      setDays(daysList);
      if (!selectedDayId && daysList.length > 0) setSelectedDayId(daysList[0].id);
    });

    return () => {
      unsubMeta();
      unsubDays();
    };
  }, [selectedGroupId, selectedDayId]);

  // Sync Current Day Content & Exercises
  useEffect(() => {
    if (!selectedDayId || !selectedGroupId) return;

    const unsubContent = onSnapshot(doc(db, 'groups', selectedGroupId, 'content', selectedDayId), (snap) => {
      if (snap.exists()) {
        setDayContents(prev => ({ ...prev, [selectedDayId]: snap.data().cells }));
      }
    });

    const unsubExs = onSnapshot(doc(db, 'groups', selectedGroupId, 'exercises', selectedDayId), (snap) => {
      if (snap.exists()) {
        setExercises(prev => ({ ...prev, [selectedDayId]: snap.data().exercises }));
      }
    });

    return () => {
      unsubContent();
      unsubExs();
    };
  }, [selectedDayId, selectedGroupId]);

  // Sync User Progress (Scoped by user and group)
  useEffect(() => {
    if (!user || !selectedGroupId) return;

    const unsubProgress = onSnapshot(collection(db, 'users', user.uid, 'groups', selectedGroupId, 'progress'), (snap) => {
      const completedIds = snap.docs.filter(d => d.data().completed).map(d => d.id);
      
      // Update exercises status based on progress
      setExercises(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(dayId => {
          next[dayId] = (next[dayId] || []).map(ex => ({
            ...ex,
            completed: completedIds.includes(ex.id) || ex.completed
          }));
        });
        return next;
      });
    });

    return () => unsubProgress();
  }, [user, selectedGroupId]);

  const handleDeleteDay = async (dayId: string) => {
    if (userRole !== 'admin' || !selectedGroupId) return;
    
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'groups', selectedGroupId, 'days', dayId));
      batch.delete(doc(db, 'groups', selectedGroupId, 'content', dayId));
      batch.delete(doc(db, 'groups', selectedGroupId, 'exercises', dayId));
      
      await batch.commit();
      
      if (selectedDayId === dayId) {
        setSelectedDayId(days.find(d => d.id !== dayId)?.id || null);
      }
    } catch (err) {
      console.error("Error deleting day:", err);
    }
  };

  const handleRenameDay = async (dayId: string, newTitle: string) => {
    if (userRole !== 'admin' || !selectedGroupId) return;
    try {
      await updateDoc(doc(db, 'groups', selectedGroupId, 'days', dayId), { title: newTitle });
    } catch (err) {
      console.error("Error renaming day:", err);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || userRole !== 'admin' || !selectedGroupId) return;

    setIsUploading(true);
    try {
      const text = await file.text();
      const nb: Notebook = JSON.parse(text);
      const partitioned = await partitionDays(nb.cells);

      const batch = writeBatch(db);
      
      const existingDaysQuery = await getDocs(collection(db, 'groups', selectedGroupId, 'days'));
      const existingCount = existingDaysQuery.size;
      const currentMaxOrder = existingDaysQuery.docs.reduce((max, d) => Math.max(max, d.data().order ?? 0), -1);

      batch.set(doc(db, 'groups', selectedGroupId, 'config', 'notebook'), {
        title: file.name,
        lastUpdated: serverTimestamp(),
        totalDays: existingCount + partitioned.length
      }, { merge: true });

      partitioned.forEach((day, index) => {
        const newIndex = existingCount + index + 1;
        const dayId = `day-${newIndex}`;
        const order = currentMaxOrder + index + 1;
        
        batch.set(doc(db, 'groups', selectedGroupId, 'days', dayId), { ...day, id: dayId, order: order });
        
        const cells = nb.cells.slice(day.cellRange[0], day.cellRange[1]);
        batch.set(doc(db, 'groups', selectedGroupId, 'content', dayId), { cells });
      });

      await batch.commit();
      setSelectedDayId(`day-${existingCount + 1}`);
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
    if (!selectedDayId || !selectedDayCells.length || !selectedGroupId) return;
    
    setIsLoadingExercises(true);
    try {
      const generated = await generateExercises(selectedDayCells);
      await setDoc(doc(db, 'groups', selectedGroupId, 'exercises', selectedDayId), { exercises: generated });
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
      await setDoc(doc(db, 'users', user.uid, 'groups', selectedGroupId, 'progress', exId), {
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
    setSelectedGroupId(null);
    setNotebook(null);
    setDays([]);
    setSelectedDayId(null);
  };

  if (!userRole || !selectedGroupId) {
    return <LoginModal onLogin={(role, groupId) => {
      setUserRole(role);
      setSelectedGroupId(groupId);
    }} />;
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans relative">
      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[40] lg:hidden animate-in fade-in duration-300" 
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-[50] lg:relative lg:block transition-transform duration-300 ease-in-out",
        isMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <Sidebar 
          days={days} 
          selectedDayId={selectedDayId} 
          onSelectDay={(id) => {
            setSelectedDayId(id);
            setIsMenuOpen(false);
          }}
          onDeleteDay={handleDeleteDay}
          onRenameDay={handleRenameDay}
          completedDays={completedDays}
          isAdmin={userRole === 'admin'}
          groupName={groupName}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full bg-slate-950 relative overflow-hidden">
        {/* Header / Top Bar */}
        <header className="h-16 lg:h-20 border-b border-white/5 flex items-center justify-between px-4 lg:px-10 bg-slate-900/50 backdrop-blur-xl z-[30]">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="lg:hidden p-2 hover:bg-white/5 rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5 text-sky-400" />
            </button>
            <div className="flex flex-col">
               {selectedDayId ? (
                 <>
                   <h1 className="text-sm lg:text-xl font-bold tracking-tight text-white truncate max-w-[150px] lg:max-w-none">
                     {days.find(d => d.id === selectedDayId)?.title}
                   </h1>
                   <p className="text-[10px] lg:text-xs text-slate-500 font-medium">Bootcamp Python</p>
                 </>
               ) : (
                 <div className="text-slate-500 text-[10px] lg:text-sm font-medium tracking-wide">Sube un notebook</div>
               )}
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-4">
            <div className="hidden sm:flex flex-col items-end mr-2 lg:mr-4 text-right">
              <div className="flex items-center gap-1.5 text-[10px] lg:text-xs font-bold text-white uppercase tracking-wider">
                {userRole === 'admin' ? <ShieldCheck className="w-3.5 h-3.5 text-sky-400" /> : <User className="w-3.5 h-3.5 text-slate-400" />}
                {userRole === 'admin' ? "Admin" : "Campista"}
              </div>
              <button 
                onClick={handleLogout}
                className="text-[9px] lg:text-[10px] text-slate-500 hover:text-red-400 transition-colors uppercase font-bold tracking-widest"
              >
                Cerrar
              </button>
            </div>

            {userRole === 'admin' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAdminModalOpen(true)}
                  className="p-2 lg:p-2.5 rounded-lg bg-slate-800 text-sky-400 hover:bg-slate-700 transition-colors border border-white/5"
                  title="Gestionar Administradores"
                >
                  <ShieldCheck className="w-4 h-4 lg:w-5 h-5" />
                </button>
                <label className={cn(
                  "flex items-center gap-2 px-3 py-1.5 lg:px-5 lg:py-2.5 rounded-lg text-[10px] lg:text-xs font-bold transition-all cursor-pointer",
                  "bg-sky-400 text-slate-950 hover:bg-sky-300 active:scale-[0.98]"
                )}>
                  <Upload className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{isUploading ? "..." : "Subir IPYNB"}</span>
                  <input type="file" accept=".ipynb" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            )}

            {selectedDayId && !exercises[selectedDayId] && (
              <button
                onClick={handleGenerateExercises}
                disabled={isLoadingExercises}
                className="flex items-center gap-2 px-3 py-1.5 lg:px-5 lg:py-2.5 bg-white/5 text-white rounded-lg text-[10px] lg:text-xs font-bold hover:bg-white/10 transition-all disabled:opacity-50 border border-white/5 shadow-xl shadow-sky-500/5 group"
              >
                {isLoadingExercises ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-sky-400 group-hover:scale-125 transition-transform" />
                )}
                <span className="hidden sm:inline">{isLoadingExercises ? "Generando..." : "Sugerir Retos"}</span>
              </button>
            )}
          </div>
        </header>

        {/* Mobile Tab Swiper */}
        <div className="lg:hidden flex border-b border-white/5 bg-slate-900/30">
          <button 
            onClick={() => setActiveTab('content')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2",
              activeTab === 'content' ? "text-sky-400 border-sky-400 bg-sky-400/5" : "text-slate-500 border-transparent"
            )}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Contenido
          </button>
          <button 
            onClick={() => setActiveTab('exercises')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2",
              activeTab === 'exercises' ? "text-sky-400 border-sky-400 bg-sky-400/5" : "text-slate-500 border-transparent"
            )}
          >
            <Code2 className="w-3.5 h-3.5" />
            Ejercicios
            {exercises[selectedDayId || ""]?.length > 0 && (
              <span className="bg-sky-400 text-slate-950 px-1.5 py-0.5 rounded-full text-[8px] ml-1">
                {exercises[selectedDayId || ""]?.length}
              </span>
            )}
          </button>
        </div>

        {/* Main Section wrapper for layout control */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Scrollable Content (Notebook) */}
          <main className={cn(
            "flex-1 overflow-y-auto bg-slate-950 transition-all duration-300",
            activeTab === 'exercises' ? "hidden lg:block" : "block"
          )}>
            {!notebook ? (
              <div className="h-full flex flex-col items-center justify-center p-6 lg:p-8 text-center max-w-xl mx-auto">
                <div className="w-16 h-16 lg:w-24 lg:h-24 rounded-2xl lg:rounded-[2rem] bg-slate-900 border border-white/5 flex items-center justify-center mb-6 lg:mb-8 shadow-2xl">
                  <FileCode className="w-8 h-8 lg:w-10 lg:h-10 text-sky-400" />
                </div>
                <h2 className="text-2xl lg:text-4xl font-black tracking-tighter mb-4 text-white uppercase italic">Py-Logbook</h2>
                <p className="text-slate-400 mb-8 lg:mb-10 text-xs lg:text-sm leading-relaxed font-medium">
                  Transforma tus complejos cuadernos de Jupyter en una experiencia de aprendizaje interactiva.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6 w-full">
                  <div className="p-4 lg:p-6 rounded-2xl bg-slate-900/50 border border-white/5 text-left group hover:border-sky-400/30 transition-all">
                    <div className="w-8 h-8 rounded-lg bg-sky-400/10 flex items-center justify-center mb-3 lg:mb-4">
                      <Search className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-sky-400" />
                    </div>
                    <h4 className="font-bold text-xs lg:text-sm mb-1 text-slate-100">Organización</h4>
                    <p className="text-[10px] lg:text-[11px] text-slate-500 font-medium">Dividimos tu contenido en secciones lógicas.</p>
                  </div>
                  <div className="p-4 lg:p-6 rounded-2xl bg-slate-900/50 border border-white/5 text-left group hover:border-emerald-400/30 transition-all">
                    <div className="w-8 h-8 rounded-lg bg-emerald-400/10 flex items-center justify-center mb-3 lg:mb-4">
                      <Sparkles className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-emerald-400" />
                    </div>
                    <h4 className="font-bold text-xs lg:text-sm mb-1 text-slate-100">Retos IA</h4>
                    <p className="text-[10px] lg:text-[11px] text-slate-500 font-medium">Generamos retos basados en el material.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto px-4 lg:px-10 py-8 lg:py-16">
                <NotebookRenderer cells={selectedDayCells} />
              </div>
            )}
          </main>

          {/* Exercise Panel (Right Sidebar / Toggle Tab) */}
          <aside className={cn(
            "fixed inset-0 z-[25] lg:relative lg:block lg:w-[400px] xl:w-[450px] bg-slate-950 transition-all duration-300",
            activeTab === 'exercises' ? "block" : "hidden lg:block"
          )}>
            <ExercisePanel 
              exercises={exercises[selectedDayId || ""] || []} 
              onComplete={handleExerciseComplete}
            />
          </aside>
        </div>
      </div>
      <AdminManagementModal 
        isOpen={isAdminModalOpen} 
        onClose={() => setIsAdminModalOpen(false)} 
      />
    </div>
  );
}
