import React, { useState, useEffect } from 'react';
import { ShieldCheck, UserPlus, Trash2, X, Search, AlertCircle, Loader2 } from 'lucide-react';
import { db, auth } from '../services/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface AdminManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminManagementModal({ isOpen, onClose }: AdminManagementModalProps) {
  const [admins, setAdmins] = useState<string[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');

  const fetchAdmins = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'admins'));
      setAdmins(snap.docs.map(d => d.id));
    } catch (err) {
      console.error("Error fetching admins:", err);
      setError("Error al cargar la lista de administradores.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAdmins();
    }
  }, [isOpen]);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail.trim() || !newAdminEmail.includes('@')) return;

    setIsUpdating(true);
    setError('');
    try {
      const email = newAdminEmail.trim().toLowerCase();
      await setDoc(doc(db, 'admins', email), {
        addedAt: serverTimestamp(),
        addedBy: auth.currentUser?.email
      });
      setAdmins(prev => Array.from(new Set([...prev, email])));
      setNewAdminEmail('');
    } catch (err: any) {
      console.error("Error adding admin:", err);
      if (err.code === 'permission-denied') {
        setError("Error de permisos: No estás autorizado para añadir administradores. Asegúrate de haber iniciado sesión con el correo correcto.");
      } else {
        setError(`Error: ${err.message || "No se pudo añadir al administrador."}`);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    if (email === 'andrezbuitrago82@gmail.com') {
      alert("No puedes eliminar al administrador principal.");
      return;
    }

    if (!confirm(`¿Estás seguro de eliminar a ${email} como administrador?`)) return;

    setIsUpdating(true);
    try {
      await deleteDoc(doc(db, 'admins', email));
      setAdmins(prev => prev.filter(a => a !== email));
    } catch (err) {
      console.error("Error removing admin:", err);
      setError("Error al eliminar al administrador.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-lg bg-slate-900 border border-white/5 rounded-[2rem] shadow-2xl relative overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="p-6 sm:p-8 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-400 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-slate-950" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-white uppercase italic">Gestionar Admins</h2>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Control de acceso administrativo</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto space-y-8">
              {/* Add New Admin Form */}
              <form onSubmit={handleAddAdmin} className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Añadir Administrador (Email)</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    <input 
                      type="email"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder="correo@google.com"
                      className="w-full bg-slate-950 border border-white/5 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-slate-800 outline-none focus:ring-2 focus:ring-sky-400/30 transition-all"
                    />
                  </div>
                  <button 
                    disabled={isUpdating || !newAdminEmail.trim() || !newAdminEmail.includes('@')}
                    className="bg-sky-400 hover:bg-sky-300 disabled:opacity-50 text-slate-950 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center gap-2"
                  >
                    {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Añadir
                  </button>
                </div>
              </form>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center gap-3 text-red-400 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Admins List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Lista de Administradores</label>
                  <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest">{admins.length + 1} Total</span>
                </div>

                <div className="space-y-2">
                  {/* Principal Admin (static) */}
                  <div className="p-4 rounded-xl bg-slate-950/50 border border-white/5 flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-sky-400/10 flex items-center justify-center">
                        <ShieldCheck className="w-4 h-4 text-sky-400" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">andrezbuitrago82@gmail.com</div>
                        <div className="text-[9px] font-bold text-sky-400/60 uppercase tracking-widest">Admin Principal</div>
                      </div>
                    </div>
                  </div>

                  {isLoading ? (
                    <div className="p-8 flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-slate-700" />
                      <span className="text-[10px] font-bold text-slate-700 uppercase tracking-widest">Cargando lista...</span>
                    </div>
                  ) : (
                    admins.filter(a => a !== 'andrezbuitrago82@gmail.com').map((email) => (
                      <div key={email} className="p-4 rounded-xl bg-slate-800/20 border border-white/5 flex items-center justify-between group hover:bg-slate-800/40 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-400/10 flex items-center justify-center">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white">{email}</div>
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Colaborador</div>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleRemoveAdmin(email)}
                          className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/10 text-slate-600 hover:text-red-400 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-950/40 text-center">
              <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">Asegúrate de que los correos sean de Google (Gmail/Workspace)</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
