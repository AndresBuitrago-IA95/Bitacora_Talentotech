import React, { useState } from 'react';
import { Lock, User, ShieldCheck, GraduationCap, ArrowRight, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

type Role = 'admin' | 'campista';

interface LoginModalProps {
  onLogin: (role: Role) => void;
}

export function LoginModal({ onLogin }: LoginModalProps) {
  const [role, setRole] = useState<Role>('campista');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (role === 'admin') {
      if (password === 'Ingeniero95*') {
        onLogin('admin');
      } else {
        setError('Contraseña administrativa incorrecta');
      }
    } else {
      onLogin('campista');
    }
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
        className="w-full max-w-md bg-slate-900 border border-white/5 rounded-[2rem] p-10 shadow-2xl relative z-10"
      >
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-sky-400 flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(56,189,248,0.3)]">
            <Lock className="w-8 h-8 text-slate-950" />
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-white uppercase italic">Acceso Bitácora</h1>
          <p className="text-slate-400 mt-2 text-sm font-medium">Selecciona tu perfil para continuar</p>
        </div>

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
            className="w-full bg-sky-400 text-slate-950 py-4 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-sky-300 transition-all flex items-center justify-center gap-2 group"
          >
            Entrar al Portal
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-white/5 text-center">
          <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Bootcamp Python v1.0 • 2026</p>
        </div>
      </motion.div>
    </div>
  );
}
