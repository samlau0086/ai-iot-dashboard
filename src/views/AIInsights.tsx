import React, { useState } from 'react';
import { BrainCircuit, Send, Sparkles, Zap, Wrench } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { UnderDevelopmentBadge } from '../components/UnderDevelopmentBadge';

export function AIInsights() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content: 'Hello Administrator. I am analyzing data from Factory A. In the last 24 hours, energy consumption is tracking 12% below the weekly baseline. How can I assist you today?'
    }
  ]);
  const { language } = useAppStore();
  const t = translations[language];

  const handleSubmit = (e: React.FormEvent, textOverride?: string) => {
    e.preventDefault();
    const submitText = textOverride || query;
    if (!submitText.trim()) return;
    
    setMessages((prev) => [...prev, { role: 'user', content: submitText }]);
    setQuery('');
    
    // Simulate AI response
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'I have logged this request and will analyze the data accordingly.' }]);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-6">
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white font-sans">
          <div className="w-8 h-8 rounded bg-orange-600 flex items-center justify-center shadow-sm">
            <BrainCircuit className="text-white h-5 w-5" /> 
          </div>
          {t.ai.title}
          <UnderDevelopmentBadge />
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {t.ai.desc}
        </p>
      </div>

      <div className="flex-1 bg-white dark:bg-[#1c2128] rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden shadow-sm">
        {/* Chat History Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 dark:bg-transparent">
          
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`h-8 w-8 rounded flex items-center justify-center shrink-0 border ${
                msg.role === 'user' 
                  ? 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600' 
                  : 'bg-orange-50 dark:bg-orange-500/10 border-orange-100 dark:border-orange-500/20'
              }`}>
                {msg.role === 'assistant' ? (
                  <BrainCircuit className="h-4 w-4 text-orange-600 dark:text-orange-500" />
                ) : (
                  <span className="text-slate-700 dark:text-slate-300 font-medium text-xs">U</span>
                )}
              </div>
              <div className={`${
                msg.role === 'user' 
                  ? 'bg-slate-900 dark:bg-slate-700 text-white dark:text-slate-100 rounded-tr-sm border-slate-800' 
                  : 'bg-white dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 rounded-tl-sm border-slate-200 dark:border-slate-800'
              } p-4 rounded-lg border max-w-2xl shadow-sm`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {idx === 0 && msg.role === 'assistant' ? (
                    <>
                      Hello Administrator. I am analyzing data from <strong className="text-slate-900 dark:text-white">Factory A</strong>. In the last 24 hours, energy consumption is tracking <strong className="text-emerald-600 dark:text-emerald-400">12% below</strong> the weekly baseline. How can I assist you today?
                    </>
                  ) : (
                    msg.content
                  )}
                </p>
                {idx === 0 && msg.role === 'assistant' && (
                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleSubmit({ preventDefault: () => {} } as any, 'Why did energy cost increase this month?');
                      }}
                      className="text-left text-xs bg-slate-50 dark:bg-[#1c2128] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-2 rounded flex items-center gap-2 border border-slate-200 dark:border-slate-700 transition-colors"
                    >
                      <Zap className="h-3 w-3 text-orange-500" /> Why did energy cost increase this month?
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleSubmit({ preventDefault: () => {} } as any, 'Which machine consumes the most electricity?');
                      }}
                      className="text-left text-xs bg-slate-50 dark:bg-[#1c2128] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-2 rounded flex items-center gap-2 border border-slate-200 dark:border-slate-700 transition-colors"
                    >
                      <Wrench className="h-3 w-3 text-blue-500" /> Which machine consumes the most electricity?
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleSubmit({ preventDefault: () => {} } as any, 'Generate a workflow for cold storage alerts.');
                      }}
                      className="text-left text-xs bg-slate-50 dark:bg-[#1c2128] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-2 rounded flex items-center gap-2 border border-slate-200 dark:border-slate-700 transition-colors"
                    >
                      <Sparkles className="h-3 w-3 text-emerald-500" /> Generate a workflow for cold storage alerts.
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white dark:bg-[#1c2128] border-t border-slate-200 dark:border-slate-800">
          <form className="relative" onSubmit={handleSubmit}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.ai.placeholder}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded pl-4 pr-12 py-3 text-sm text-slate-900 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 transition-all font-mono"
            />
            <button 
              type="submit" 
              className="absolute right-2 top-2 p-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
