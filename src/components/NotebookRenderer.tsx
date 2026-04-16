import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { NotebookCell } from '../types';
import { cn } from '../lib/utils';

interface NotebookRendererProps {
  cells: NotebookCell[];
}

export function NotebookRenderer({ cells }: NotebookRendererProps) {
  return (
    <div className="space-y-8 pb-20">
      {cells.map((cell, idx) => (
        <div key={idx} className="group">
          {cell.cell_type === 'markdown' ? (
            <div className="prose prose-invert prose-slate max-w-none prose-headings:text-sky-400 prose-headings:font-display prose-headings:tracking-tight prose-a:text-sky-400 prose-code:text-sky-300">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {cell.source.join('')}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="rounded-lg border border-white/5 bg-slate-900/50 overflow-hidden font-mono text-sm border-l-4 border-l-sky-400">
              <div className="bg-slate-900 px-4 py-2 flex items-center justify-between border-b border-white/5">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Python Snippet</span>
                {cell.execution_count && (
                  <span className="text-slate-500 text-[10px]">[{cell.execution_count}]</span>
                )}
              </div>
              <pre className="p-4 overflow-x-auto text-slate-300">
                <code>{cell.source.join('')}</code>
              </pre>
              {cell.outputs && cell.outputs.length > 0 && (
                <div className="border-t border-white/5 bg-black/40 p-4">
                  <span className="text-[9px] uppercase tracking-widest text-slate-500 block mb-2 font-bold">Output</span>
                  {cell.outputs.map((out, oIdx) => (
                    <div key={oIdx} className="text-slate-400 whitespace-pre-wrap leading-relaxed">
                      {out.text ? out.text.join('') : out.data?.['text/plain']?.join('') || ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
