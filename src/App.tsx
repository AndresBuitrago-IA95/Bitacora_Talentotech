import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Upload, FileCode, Search, Sparkles, Loader2, LogOut, User, ShieldCheck, Menu, X, BookOpen, Code2, Image, Download, Trash2, Monitor } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { NotebookRenderer } from './components/NotebookRenderer';
import { ExercisePanel } from './components/ExercisePanel';
import { LoginModal } from './components/LoginModal';
import { AdminManagementModal } from './components/AdminManagementModal';
import { generateExercises, partitionDays } from './services/geminiService';
import { Notebook, DayContent, Exercise, NotebookCell, Resource } from './types';
import { cn } from './lib/utils';
import { auth, db, logout } from './services/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  doc, onSnapshot, setDoc, updateDoc, 
  collection, getDocs, writeBatch, serverTimestamp, 
  getDoc, query, where, arrayUnion, deleteDoc
} from 'firebase/firestore';
import * as pdfjs from 'pdfjs-dist';
import JSZip from 'jszip';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error Details:', JSON.stringify(errInfo, null, 2));
  throw new Error(error instanceof Error ? error.message : "Error de base de datos");
}

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
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
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
      if (!selectedDayId && !selectedResourceId && daysList.length > 0) setSelectedDayId(daysList[0].id);
    });

    // 3. Sync Resources
    const unsubResources = onSnapshot(collection(db, 'groups', selectedGroupId, 'resources'), (snap) => {
      const resList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Resource));
      setResources(resList);
    });

    return () => {
      unsubMeta();
      unsubDays();
      unsubResources();
    };
  }, [selectedGroupId, selectedDayId, selectedResourceId]);

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

  const extractTextFromPDF = async (file: File): Promise<string> => {
    try {
      console.log("Starting PDF extraction for:", file.name);
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      
      console.log(`PDF has ${pdf.numPages} pages`);
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n\n';
      }
      
      console.log("PDF extraction complete. Length:", fullText.length);
      return fullText;
    } catch (error) {
      console.error("Error extracting text from PDF:", error);
      return `Error al extraer texto del PDF: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  const extractTextFromPPTX = async (file: File): Promise<string> => {
    try {
      console.log("Starting PPTX extraction for:", file.name);
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      let fullText = '';
      
      const slideFiles = Object.keys(zip.files).filter(name => 
        name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
      );
      
      console.log(`Found ${slideFiles.length} slides in PPTX`);

      // Sort slides numerically
      slideFiles.sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || '0');
        const numB = parseInt(b.match(/\d+/)?.[0] || '0');
        return numA - numB;
      });

      for (const slidePath of slideFiles) {
        const content = await zip.file(slidePath)?.async('string');
        if (content) {
          // Robust XML text extraction for PPTX
          // Captures text inside <a:t> regardless of attributes/namespaces
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(content, "text/xml");
          const textNodes = xmlDoc.getElementsByTagName("a:t");
          
          let slideText = "";
          for (let j = 0; j < textNodes.length; j++) {
            slideText += (textNodes[j].textContent || "") + " ";
          }
          
          if (slideText.trim()) {
            fullText += `--- Diapositiva ---\n${slideText.trim()}\n\n`;
          }
        }
      }
      
      if (!fullText.trim()) {
        console.warn("Direct slide extraction failed, attempting deep search...");
        // Search through all files in ppt/ for any <a:t> tags
        for (const filename of Object.keys(zip.files)) {
          if (filename.startsWith('ppt/') && filename.endsWith('.xml')) {
            const content = await zip.file(filename)?.async('string') || "";
            const matches = content.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);
            if (matches) {
              const partText = matches.map(m => m.replace(/<a:t[^>]*>|<\/a:t>/g, '')).join(' ');
              if (partText.trim()) fullText += partText + " ";
            }
          }
        }
      }

      console.log("PPTX extraction complete. Total text length:", fullText.length);
      return fullText;
    } catch (error) {
      console.error("Error extracting text from PPTX:", error);
      return `Error al extraer texto de ${file.name}. Asegúrate de que es un archivo PPTX válido.`;
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    console.log("File detected:", file?.name, "Size:", file?.size, "Type:", file?.type);
    
    if (!file) return;
    
    if (userRole !== 'admin') {
      alert("Error: Solo los administradores pueden subir recursos.");
      if (event.target) event.target.value = '';
      return;
    }
    
    if (!selectedGroupId) {
      alert("Error: Por favor selecciona un grupo primero.");
      if (event.target) event.target.value = '';
      return;
    }

    // Allow processing of files up to 200MB
    const MAX_PROCESS_SIZE = 200 * 1024 * 1024;
    // Firestore Document Limit is 1MB. Base64 adds ~33% overhead.
    // We'll only store binary data if it's under 600KB to be absolutely safe.
    const MAX_BINARY_STORAGE_SIZE = 600 * 1024;

    if (file.size > MAX_PROCESS_SIZE) {
      alert(`El archivo "${file.name}" es demasiado grande (${(file.size / (1024 * 1024)).toFixed(1)}MB). El máximo es 200MB.`);
      if (event.target) event.target.value = '';
      return;
    }

    setIsUploading(true);
    console.log(`Starting upload process for: ${file.name} (${file.size} bytes)`);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const mimeType = file.type;
      
      let text = '';
      let type: Resource['type'] = 'other';
      let dataUrl = '';

      if (extension === 'ipynb') {
        const textNb = await file.text();
        const nb: Notebook = JSON.parse(textNb);
        await processNotebook(nb, file.name);
        setIsUploading(false);
        if (event.target) event.target.value = '';
        return;
      }

      if (extension === 'pdf') {
        text = await extractTextFromPDF(file);
        type = 'pdf';
      } else if (extension === 'pptx') {
        text = await extractTextFromPPTX(file);
        type = 'pptx';
      } else if (mimeType.startsWith('image/')) {
        const reader = new FileReader();
        const readPromise = new Promise<string>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
        dataUrl = await readPromise;
        type = 'image';
        text = 'Vista previa de imagen';
      } else if (mimeType.startsWith('text/') || ['py', 'js', 'json', 'md', 'csv', 'ts', 'tsx'].includes(extension || '')) {
        text = await file.text();
        type = 'text';
      } else {
        // Fallback for others
        text = `Contenido del archivo: ${file.name}`;
        type = 'other';
      }

      const resId = `res-${Date.now()}`;
      const path = `groups/${selectedGroupId}/resources/${resId}`;
      
      // For binary files, only generate dataUrl if it's small enough for Firestore
      if (!dataUrl && file.size < MAX_BINARY_STORAGE_SIZE) {
        console.log("Reading file as DataURL for storage...");
        const reader = new FileReader();
        const readPromise = new Promise<string>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
        dataUrl = await readPromise;
      } else if (file.size >= MAX_BINARY_STORAGE_SIZE) {
        console.warn(`File is too large for binary storage (${(file.size/1024).toFixed(1)}KB). Only extracted text will be saved.`);
      }

      try {
        const docRef = doc(db, 'groups', selectedGroupId, 'resources', resId);
        console.log("Saving document to Firestore path:", path);
        
        // Ensure text isn't too huge (Firestore limit is 1MB total)
        // 400k chars is ~400KB-800KB, safe margin for metadata
        const safeText = text.length > 400000 ? text.substring(0, 400000) + "\n\n... [Contenido truncado debido al tamaño del archivo]" : text;

        await setDoc(docRef, {
          id: resId,
          title: file.name,
          type: type,
          content: safeText,
          originalName: file.name,
          mimeType: mimeType,
          url: dataUrl || null,
          createdAt: serverTimestamp()
        });
        
        console.log("Resource successfully saved to Firestore:", resId);
        alert(`¡Recurso "${file.name}" guardado con éxito!`);
        
        setSelectedResourceId(resId);
        setSelectedDayId(null);
      } catch (dbError) {
        console.error("Firestore saving error:", dbError);
        handleFirestoreError(dbError, OperationType.WRITE, path);
      }

      // If it's a doc, ALSO try to convert to notebook if it matches
      if (type === 'pdf' || type === 'pptx') {
        try {
          const { convertDocToNotebook } = await import('./services/geminiService');
          const cells = await convertDocToNotebook(file.name, text);

          if (cells && cells.length > 0) {
            console.log("Converting doc to notebook...");
            await processNotebook({ cells, metadata: {}, nbformat: 4, nbformat_minor: 5 }, file.name);
          }
        } catch (nbError) {
          console.warn("Notebook conversion failed (ignoring as resource was saved):", nbError);
        }
      }
      
    } catch (error) {
      console.error("Error processing file:", error);
      alert("Error al procesar el archivo. Revisa que el formato sea correcto.");
    } finally {
      setIsUploading(false);
      if (event.target) event.target.value = '';
    }
  };

  const processNotebook = async (nb: Notebook, fileName: string) => {
    if (!selectedGroupId) return;
    const partitioned = await partitionDays(nb.cells);
    const batch = writeBatch(db);
    
    const existingDaysQuery = await getDocs(collection(db, 'groups', selectedGroupId, 'days'));
    const existingCount = existingDaysQuery.size;
    const currentMaxOrder = existingDaysQuery.docs.reduce((max, d) => Math.max(max, d.data().order ?? 0), -1);

    batch.set(doc(db, 'groups', selectedGroupId, 'config', 'notebook'), {
      title: fileName,
      lastUpdated: serverTimestamp(),
      totalDays: existingCount + partitioned.length
    }, { merge: true });

    partitioned.forEach((day, index) => {
      // Use a timestamp based unique ID instead of just a counter to avoid collisions after deletions
      const dayId = `day-${Date.now()}-${index}`;
      const order = currentMaxOrder + index + 1;
      
      batch.set(doc(db, 'groups', selectedGroupId, 'days', dayId), { 
        ...day, 
        id: dayId, 
        order: order,
        sourceFile: fileName,
        uploadedAt: serverTimestamp()
      });
      
      const cells = nb.cells.slice(day.cellRange[0], day.cellRange[1]);
      batch.set(doc(db, 'groups', selectedGroupId, 'content', dayId), { cells });
      
      // Auto-select the first new day
      if (index === 0) {
        setSelectedDayId(dayId);
      }
    });

    await batch.commit();
    setSelectedResourceId(null);
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
          resources={resources}
          selectedDayId={selectedDayId} 
          selectedResourceId={selectedResourceId}
          onSelectDay={(id) => {
            setSelectedDayId(id);
            setSelectedResourceId(null);
            setIsMenuOpen(false);
          }}
          onSelectResource={(id) => {
            setSelectedResourceId(id);
            setSelectedDayId(null);
            setIsMenuOpen(false);
          }}
          onDeleteDay={handleDeleteDay}
          onRenameDay={handleRenameDay}
          onDeleteResource={async (id) => {
            if (userRole !== 'admin' || !selectedGroupId) {
              console.warn("Delete attempted without admin role or group selection", { userRole, selectedGroupId });
              return;
            }
            
            try {
              console.log("Attempting deletion of resource:", id, "in group:", selectedGroupId);
              const docRef = doc(db, 'groups', selectedGroupId, 'resources', id);
              await deleteDoc(docRef);
              
              if (selectedResourceId === id) {
                setSelectedResourceId(null);
              }
              console.log("Successfully deleted resource:", id);
            } catch (error) {
              handleFirestoreError(error, OperationType.DELETE, `groups/${selectedGroupId}/resources/${id}`);
            }
          }}
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
               ) : selectedResourceId ? (
                <>
                  <h1 className="text-sm lg:text-xl font-bold tracking-tight text-white truncate max-w-[150px] lg:max-w-none">
                    {resources.find(r => r.id === selectedResourceId)?.title}
                  </h1>
                  <p className="text-[10px] lg:text-xs text-slate-500 font-medium">Recurso Adicional</p>
                </>
               ) : (
                 <div className="text-slate-500 text-[10px] lg:text-sm font-medium tracking-wide">Sube un notebook o documento</div>
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
                  <span className="hidden sm:inline">{isUploading ? "..." : "Sube Contenido"}</span>
                  <input type="file" accept=".ipynb,.pdf,.pptx" className="hidden" onChange={handleFileUpload} />
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
            {!notebook && !selectedResourceId ? (
              <div className="h-full flex flex-col items-center justify-center p-6 lg:p-8 text-center max-w-xl mx-auto">
                <div className="w-16 h-16 lg:w-24 lg:h-24 rounded-2xl lg:rounded-[2rem] bg-slate-900 border border-white/5 flex items-center justify-center mb-6 lg:mb-8 shadow-2xl">
                  <FileCode className="w-8 h-8 lg:w-10 lg:h-10 text-sky-400" />
                </div>
                <h2 className="text-2xl lg:text-4xl font-black tracking-tighter mb-4 text-white uppercase italic">Py-Logbook</h2>
                <p className="text-slate-400 mb-8 lg:mb-10 text-xs lg:text-sm leading-relaxed font-medium">
                  Sube notebooks (.ipynb) o documentos (.pdf, .pptx) para comenzar.
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
            ) : selectedResourceId ? (
              <div className="max-w-4xl mx-auto px-4 lg:px-10 py-8 lg:py-16">
                 {(() => {
                   const res = resources.find(r => r.id === selectedResourceId);
                   if (!res) return null;
                   return (
                     <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center justify-between gap-4 mb-12">
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "w-14 h-14 rounded-2xl flex items-center justify-center border border-white/10 shadow-2xl",
                              res.type === 'pdf' ? "bg-red-500/20 text-red-400" : 
                              res.type === 'image' ? "bg-emerald-500/20 text-emerald-400" :
                              res.type === 'pptx' ? "bg-orange-500/20 text-orange-400" :
                              "bg-sky-500/20 text-sky-400"
                            )}>
                              {res.type === 'pdf' ? <BookOpen className="w-7 h-7" /> : 
                               res.type === 'image' ? <Image className="w-7 h-7" /> :
                               res.type === 'pptx' ? <Monitor className="w-7 h-7" /> :
                               <FileCode className="w-7 h-7" />}
                            </div>
                            <div>
                              <h2 className="text-2xl lg:text-3xl font-black text-white uppercase italic tracking-tight leading-tight">{res.title}</h2>
                              <div className="flex items-center gap-2 mt-2">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border",
                                  res.type === 'pdf' ? "bg-red-500/10 border-red-500/20 text-red-400" : 
                                  res.type === 'image' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                                  res.type === 'pptx' ? "bg-orange-500/10 border-orange-500/20 text-orange-400" :
                                  "bg-sky-500/10 border-sky-500/20 text-sky-400"
                                )}>
                                  {res.type.toUpperCase()}
                                </span>
                                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Recurso Adicional</span>
                              </div>
                            </div>
                          </div>
 
                          {(res.url || res.content) && (
                            <button
                              onClick={() => {
                                const downloadUrl = res.url || `data:${res.mimeType || 'text/plain'};base64,${btoa(unescape(encodeURIComponent(res.content || '')))}`;
                                const link = document.createElement('a');
                                link.href = downloadUrl;
                                link.download = res.originalName || res.title;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }}
                              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white transition-all duration-300 border border-white/5 hover:border-white/10 group active:scale-95"
                            >
                              <Download className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
                              <span className="text-xs font-black uppercase tracking-widest">Descargar</span>
                            </button>
                          )}
                        </div>
 
                        <div className="bg-slate-900/40 border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl backdrop-blur-xl relative group/content min-h-[400px] flex flex-col">
                           <div className="absolute inset-0 bg-gradient-to-b from-sky-400/5 to-transparent pointer-events-none opacity-0 group-hover/content:opacity-100 transition-opacity duration-700" />
                           
                           {res.type === 'image' && res.url ? (
                             <div className="flex-1 p-8 flex items-center justify-center">
                               <img 
                                 src={res.url} 
                                 alt={res.title} 
                                 className="max-w-full max-h-[70vh] rounded-xl shadow-2xl border border-white/10 object-contain"
                                 referrerPolicy="no-referrer"
                               />
                             </div>
                           ) : res.type === 'pptx' ? (
                             <div className="p-8 lg:p-14 space-y-12">
                                {res.content?.split('--- Diapositiva ---').filter(Boolean).map((slide, i) => (
                                  <div key={i} className="bg-slate-950/50 border border-white/5 rounded-3xl p-8 lg:p-12 relative group/slide hover:border-sky-400/20 transition-colors">
                                    <div className="absolute top-6 right-8 text-[10px] font-black text-slate-700 uppercase tracking-widest group-hover/slide:text-sky-400/40 transition-colors">
                                      SLIDE {i + 1}
                                    </div>
                                    <div className="prose prose-invert max-w-none">
                                      {slide.trim().split('\n\n').map((para, pi) => (
                                        <p key={pi} className="text-slate-300 leading-relaxed text-base lg:text-lg mb-4 whitespace-pre-wrap">
                                          {para}
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                             </div>
                           ) : (
                             <div className="p-8 lg:p-14 prose prose-invert max-w-none prose-p:text-slate-300 prose-p:leading-relaxed prose-p:text-base lg:prose-p:text-lg prose-headings:text-white prose-pre:bg-slate-950 prose-pre:border prose-pre:border-white/5 prose-strong:text-sky-400 relative z-10">
                                {res.content?.split('\n\n').map((para, i) => {
                                  // Check for headings in plain text
                                  if (para.length < 100 && (para.toUpperCase() === para || para.endsWith(':'))) {
                                    return <h3 key={i} className="text-xl font-bold text-white mt-8 mb-4 border-l-4 border-sky-400 pl-4">{para}</h3>;
                                  }
                                  return (
                                    <p key={i} className="mb-6 leading-relaxed selection:bg-sky-400/30 whitespace-pre-wrap">
                                      {para}
                                    </p>
                                  );
                                })}
                             </div>
                           )}
                        </div>
 
                        <div className="flex justify-center pt-8">
                           <div className="px-6 py-3 rounded-full bg-slate-900 border border-white/5 flex items-center gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                             <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                             Fin del documento
                           </div>
                        </div>
                     </div>
                   );
                 })()}
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
