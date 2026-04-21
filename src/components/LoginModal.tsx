import React, { useState } from 'react';
import { Lock, User, ShieldCheck, GraduationCap, ArrowRight, AlertCircle, Chrome, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { loginWithGoogle, loginAnonymously, auth, db } from '../services/firebase';
import { collection, getDocs, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { Group } from '../types';

type Role = 'admin' | 'campista';

interface LoginModalProps {
  onLogin: (role: Role, groupId: string) => void;
}

export function LoginModal({ onLogin }: LoginModalProps) {
  const [role, setRole] = useState<Role>('campista');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [step, setStep] = useState<'login' | 'group'>('login');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const fetchGroups = async () => {
    try {
      const snap = await getDocs(collection(db, 'groups'));
      const groupsList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Group));
      setGroups(groupsList);
      if (groupsList.length > 0 && !selectedGroupId) {
        setSelectedGroupId(groupsList[0].id);
      }
    } catch (err) {
      console.error("Error fetching groups:", err);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setIsCreatingGroup(true);
    setError('');
    try {
      const docRef = await addDoc(collection(db, 'groups'), {
        name: newGroupName.trim(),
        createdAt: serverTimestamp()
      });
      const newGroup = { id: docRef.id, name: newGroupName.trim(), createdAt: new Date() };
      setGroups(prev => [...prev, newGroup]);
      setSelectedGroupId(docRef.id);
      setNewGroupName('');
    } catch (err: any) {
      console.error("Error creating group:", err);
      setError("No tienes permisos para crear grupos o hubo un error de red.");
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const checkIsAdmin = async (email: string | null) => {
    if (!email) return false;
    if (email === 'andrezbuitrago82@gmail.com') return true;
    try {
      const adminSnap = await getDoc(doc(db, 'admins', email));
      return adminSnap.exists();
    } catch (err) {
      console.error("Error checking admin status:", err);
      return false;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setError('');

    try {
      if (role === 'admin') {
        if (password !== 'Ingeniero95*') {
          setError('Contraseña administrativa incorrecta.');
          setIsAuthenticating(false);
          return;
        }

        const result = await loginWithGoogle();
        const user = result.user;
        const isAdminUser = await checkIsAdmin(user.email);

        if (isAdminUser) {
          setIsLoggedIn(true);
          await fetchGroups();
          setStep('group');
        } else {
          setError(`El correo ${user.email} no tiene permisos de admin.`);
          await auth.signOut();
        }
      } else {
        await loginAnonymously();
        setIsLoggedIn(true);
        await fetchGroups();
        setStep('group');
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(`Error: ${err.message || 'Fallo en autenticación'}`);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleStart = () => {
    if (!selectedGroupId) {
      setError('Por favor selecciona un grupo.');
      return;
    }
    onLogin(role, selectedGroupId);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950 px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-sky-500 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-md bg-slate-900 border border-white/5 rounded-[2rem] p-6 sm:p-10 shadow-2xl relative z-10"
      >
        <div className="flex flex-col items-center text-center mb-6 sm:mb-10">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-sky-400 flex items-center justify-center mb-4 sm:mb-6 shadow-[0_0_20px_rgba(56,189,248,0.3)]">
            <Lock className="w-6 h-6 sm:w-8 sm:h-8 text-slate-950" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tighter text-white uppercase italic text-center">
            {step === 'login' ? 'Acceso Bitácora' : 'Configuración Inicial'}
          </h1>
          <p className="text-slate-400 mt-2 text-xs sm:text-sm font-medium">
            {step === 'login' ? 'Selecciona tu perfil para continuar' : 'Elige el grupo del bootcamp'}
          </p>
        </div>

        {step === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => { setRole('campista'); setError(''); }}
                className={cn(
                  "p-4 rounded-xl border flex flex-col items-center gap-2 transition-all",
                  role === 'campista' 
                    ? "bg-sky-400/10 border-sky-400 text-sky-400" 
                    : "bg-slate-800/50 border-white/5 text-slate-500 hover:border-white/10"
                )}
              >
                <GraduationCap className="w-6 h-6" />
                <span className="text-xs font-bold uppercase tracking-widest">Campista</span>
              </button>
              <button
                type="button"
                onClick={() => { setRole('admin'); setError(''); }}
                className={cn(
                  "p-4 rounded-xl border flex flex-col items-center gap-2 transition-all",
                  role === 'admin' 
                    ? "bg-sky-400/10 border-sky-400 text-sky-400" 
                    : "bg-slate-800/50 border-white/5 text-slate-500 hover:border-white/10"
                )}
              >
                <ShieldCheck className="w-6 h-6" />
                <span className="text-xs font-bold uppercase tracking-widest">Admin</span>
              </button>
            </div>

            <AnimatePresence mode="wait">
              {role === 'admin' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Contraseña Admin</label>
                    <div className="relative">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-950 border border-white/5 rounded-xl px-4 py-3 text-white placeholder:text-slate-800 focus:ring-2 focus:ring-sky-400/30 outline-none transition-all"
                        autoFocus
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-3 text-red-400 text-xs font-medium"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isAuthenticating}
              className={cn(
                "w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all flex items-center justify-center gap-3 group disabled:opacity-50 shadow-xl",
                role === 'admin' 
                  ? "bg-sky-400 text-slate-950 hover:bg-sky-300 shadow-sky-400/20" 
                  : "bg-white text-slate-950 hover:bg-slate-200 shadow-white/10"
              )}
            >
              {isAuthenticating ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {role === 'admin' ? <Chrome className="w-4 h-4" /> : <Zap className="w-4 h-4 fill-current" />}
                  {role === 'admin' ? "Validar con Google" : "Entrar como Campista"}
                </>
              )}
              {!isAuthenticating && <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />}
            </button>
          </form>
        ) : (
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                  {role === 'admin' ? 'Gestionar Grupo' : 'Selecciona tu Grupo'}
                </label>
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="w-full bg-slate-950 border border-white/5 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-sky-400/30 outline-none transition-all text-sm"
                >
                  <option value="" disabled>-- Seleccionar Grupo --</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              {role === 'admin' && (
                <div className="pt-2 space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                    Crear Nuevo Grupo
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Nombre del grupo..."
                      className="flex-1 bg-slate-950 border border-white/5 rounded-xl px-4 py-3 text-white placeholder:text-slate-800 text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCreateGroup}
                      disabled={isCreatingGroup || !newGroupName.trim()}
                      className="bg-emerald-500 text-slate-950 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider disabled:opacity-50"
                    >
                      {isCreatingGroup ? "..." : "Crear"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-3 text-red-400 text-xs font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              onClick={handleStart}
              className="w-full py-4 bg-sky-400 text-slate-950 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-sky-300 transition-all shadow-xl shadow-sky-400/20 flex items-center justify-center gap-2 group"
            >
              Comenzar Bitácora
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button 
              onClick={() => { setStep('login'); auth.signOut(); }}
              className="w-full text-center text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest transition-colors"
            >
              Volver al inicio
            </button>
          </div>
        )}

        <div className="mt-8 pt-8 border-t border-white/5 text-center">
          <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Bootcamp Python v1.0 • 2026</p>
        </div>
      </motion.div>
    </div>
  );
}
