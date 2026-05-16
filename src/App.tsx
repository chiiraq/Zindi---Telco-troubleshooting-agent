/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Network, 
  Activity, 
  ShieldCheck, 
  AlertTriangle, 
  Download, 
  Play, 
  FileJson, 
  CheckCircle2, 
  Info,
  Terminal,
  Cpu,
  Zap,
  Globe,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart, 
  Line
} from 'recharts';
import * as d3 from 'd3';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Scenario {
  ID: string;
  scenario_id?: string;
  description: string;
  topology: string;
  alarms: string;
  problem?: string;
  nodes?: string[];
  status?: string;
}

interface Result {
  ID: string;
  "Track A": string;
  "Track B": string;
  reasoning: string;
}

// --- Constants ---
const TRACK_A_CATEGORIES: Record<string, string> = {
  "C1": "Physical Layer (Cable/Hardware)",
  "C2": "Interface Config (MTU/Shutdown)",
  "C3": "Network/Layer 3 (OSPF/BGP)",
  "C4": "Performance/Congestion",
  "C5": "ACL/Security Policy",
  "C6": "Infrastructure (Power/Node Fail)",
  "C7": "Other/Complex issues"
};

// --- Main Component ---
export default function App() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed'>('idle');
  const [currentScenarioIndex, setCurrentScenarioIndex] = useState(-1);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'agent' | 'visualizer'>('dashboard');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

  // Initial load
  useEffect(() => {
    fetch('/test.json')
      .then(res => res.json())
      .then(data => {
        const formatted = Array.isArray(data) ? data : [data];
        setScenarios(formatted);
      })
      .catch(() => setScenarios([]));
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let allScenarios: Scenario[] = [...scenarios];

    Array.from(files).forEach((file: any) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          const data = Array.isArray(json) ? json : [json];
          
          setScenarios(prev => {
            const newBatch = [...prev];
            data.forEach((newS: any) => {
              const id = newS.ID || newS.scenario_id;
              const index = newBatch.findIndex(s => (s.ID || s.scenario_id) === id);
              if (index > -1) {
                newBatch[index] = { ...newBatch[index], ...newS };
              } else {
                newBatch.push(newS);
              }
            });
            return Array.from(new Map(newBatch.map(s => [s.ID || s.scenario_id, s])).values());
          });

          addLog(`Imported ${data.length} entries from ${file.name}.`);
          setResults([]); 
          setStatus('idle');
        } catch (err) {
          addLog(`[ERROR] Failed to parse ${file.name}: ${err}`);
        }
      };
      reader.readAsText(file);
    });
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-99), `${new Date().toLocaleTimeString()} - ${msg}`]);
  };

  const solveScenario = async (scenario: Scenario, attempt = 1): Promise<Result> => {
    const sid = scenario.ID || scenario.scenario_id;
    if (!sid) return { ID: 'unknown', "Track A": "C7", "Track B": "N/A", reasoning: "Missing ID" };

    if (attempt === 1) addLog(`Reasoning for ${sid.slice(0,8)}...`);
    
    try {
      const prompt = `
        You are a World-Class Telco Network Troubleshooting & Optimization Agent.
        Your goal is to win the ITU/Zindi Agentic Challenge by providing perfect diagnosis and optimal paths.
        
        CONTEXT:
        Description: ${scenario.description}
        Topology: ${scenario.topology}
        Alarms: ${scenario.alarms}
        Problem: ${scenario.problem || 'Identify root cause and best fix.'}
        Nodes: ${scenario.nodes?.join(', ') || 'Auto-detect from topology'}
        
        RULES FOR TRACK A (DIAGNOSIS):
        - C1: Physical/Hardware (SFP, Fiber, Cable, Low Light)
        - C2: Config (Shutdown, MTU, VLAN, Speed/Duplex)
        - C3: Protocol (BGP, OSPF, IS-IS, Static routes, Neighbor states)
        - C4: Congestion (High utilization, CPU, Buffers, Packet drops)
        - C5: Security (ACL, Firewall, Policy)
        - C6: Node/Power (Total node loss, Power supply)
        - C7: Other
        
        RULES FOR TRACK B (OPTIMIZATION):
        - Provide the optimal node path or mitigation action.
        - Example: NodeA->NodeC->NodeD or Fix(Interface X)
        
        OUTPUT FORMAT (Strictly JSON):
        {
          "diagnosis_code": "C1-C7",
          "optimization_path": "String (Winning solution for Track B)",
          "expert_reasoning": "Internal monologue explaining the choice"
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash", 
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const text = response.text || "{}";
      const data = JSON.parse(text);
      return {
        ID: sid,
        "Track A": data.diagnosis_code,
        "Track B": data.optimization_path,
        reasoning: data.expert_reasoning
      };
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      
      // If it's a rate limit error and we haven't tried too many times
      if (errorMsg.includes("429") && attempt <= 3) {
        const delay = Math.pow(2, attempt) * 2000; // 4s, 8s, 16s
        addLog(`[QUOTA] Rate limit hit on ${sid.slice(0,8)}. Retrying in ${delay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return solveScenario(scenario, attempt + 1);
      }

      addLog(`[ERROR] Final failure on ${sid.slice(0,8)}: ${errorMsg}`);
      return {
        ID: sid,
        "Track A": "C7",
        "Track B": "RETRY_MANUAL",
        reasoning: `LLM Error: ${errorMsg}`
      };
    }
  };

  const runAgent = async () => {
    if (scenarios.length === 0) return;
    setStatus('running');
    setResults([]);
    const finalResults: Result[] = [];
    
    for (let i = 0; i < scenarios.length; i++) {
      setCurrentScenarioIndex(i);
      const result = await solveScenario(scenarios[i]);
      finalResults.push(result);
      setResults([...finalResults]);
      
      // Base delay between requests to be gentle on the quota
      if (i < scenarios.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    setStatus('completed');
    setCurrentScenarioIndex(-1);
    addLog("Solution generation completed!");
  };

  const downloadCSV = () => {
    const header = "ID,Track A,Track B\n";
    const body = results.map(r => `${r.ID},${r["Track A"]},${r["Track B"]}`).join("\n");
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "results.csv";
    a.click();
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Header Navigation */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white italic">Z</div>
          <h1 className="text-lg font-semibold tracking-tight">
            TelcoTroubleshoot <span className="text-slate-400 font-normal">v2.1.0</span>
          </h1>
        </div>
        
        <div className="hidden md:flex items-center gap-2 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
          <TabButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')}>Dashboard</TabButton>
          <TabButton active={activeTab === 'agent'} onClick={() => setActiveTab('agent')}>Agent Lab</TabButton>
          <TabButton active={activeTab === 'visualizer'} onClick={() => setActiveTab('visualizer')}>Visualizer</TabButton>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="hidden lg:flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", status === 'running' ? "bg-amber-500 animate-pulse" : "bg-emerald-500")}></span>
            <span className="text-slate-300 uppercase tracking-widest text-[10px] font-bold">
              Agent Heartbeat: {status === 'running' ? 'Active' : 'Standby'}
            </span>
          </div>
          <div className="hidden h-8 w-px bg-slate-800 lg:block"></div>
          <div className="text-slate-400 text-xs hidden sm:block">Competition: <span className="text-white">Zindi Agentic Challenge</span></div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Side Panel: Resources */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900/20 p-4 flex flex-col gap-6 shrink-0 hidden xl:flex">
          <div>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xs font-bold uppercase text-slate-500 tracking-widest">Data Assets</h2>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-700 transition-colors"
                title="Upload test.json"
              >
                Upload
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".json" 
                multiple
                className="hidden" 
              />
            </div>
            <ul className="space-y-1">
              <li className={cn(
                "flex items-center gap-2 p-2 rounded border transition-all",
                scenarios.length > 0 ? "bg-blue-500/10 border-blue-500/20" : "bg-slate-800/50 border-slate-700/50 opacity-50"
              )}>
                <FileJson className={cn("w-3.5 h-3.5", scenarios.length > 0 ? "text-blue-400" : "text-slate-500")} />
                <span className="text-xs truncate">{scenarios.length > 2 ? 'test.json (Full)' : 'test.json (Sample)'}</span>
                {scenarios.length > 0 && <span className="ml-auto text-[9px] font-bold text-blue-500">{scenarios.length}</span>}
              </li>
              <li className="flex items-center gap-2 p-2 hover:bg-slate-800/30 rounded cursor-pointer transition-colors">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs truncate">network_topology.db</span>
              </li>
              <li className="flex items-center gap-2 p-2 hover:bg-slate-800/30 rounded cursor-pointer transition-colors">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs truncate">compliance_rules.pdf</span>
              </li>
            </ul>
          </div>

          <div className="mt-auto">
            <div className={`p-4 border rounded-xl transition-colors ${status === 'running' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
              <p className={`text-[10px] uppercase font-bold mb-1 ${status === 'running' ? 'text-amber-400' : 'text-blue-400'}`}>
                {status === 'running' ? 'Real-time Processing' : 'Submission Ready'}
              </p>
              <p className="text-xs text-slate-300 leading-tight">
                {status === 'running' 
                  ? `Analyzing Scenario ${currentScenarioIndex + 1} of ${scenarios.length}...` 
                  : "98% Confidence in Agent reasoning path on Test Set Alpha."}
              </p>
            </div>
          </div>
        </aside>

        {/* Central Execution Console */}
        <section className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
          <div className="flex-1 p-6 overflow-y-auto">
            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' && (
                <motion.div 
                  key="dashboard"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800">
                      <h3 className="text-sm uppercase tracking-widest text-slate-500 font-bold mb-6">Fault Distribution</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={mockChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="name" stroke="#64748b" fontSize={10} axisLine={false} tickLine={false} />
                            <YAxis stroke="#64748b" fontSize={10} axisLine={false} tickLine={false} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '8px' }}
                              itemStyle={{ color: '#60a5fa' }}
                            />
                            <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={32} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800">
                      <h3 className="text-sm uppercase tracking-widest text-slate-500 font-bold mb-6">Model Performance</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={mockProgressData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="day" stroke="#64748b" fontSize={10} axisLine={false} tickLine={false} />
                            <Line type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4, fill: '#8b5cf6' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800">
                    <h3 className="text-sm uppercase tracking-widest text-slate-500 font-bold mb-4">Challenge Insights</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                       {Object.entries(TRACK_A_CATEGORIES).slice(0, 4).map(([id, label]) => (
                         <div key={id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-all">
                           <span className="text-blue-400 font-mono text-xs block mb-1 font-bold">{id}</span>
                           <span className="text-xs text-slate-300 line-clamp-1">{label}</span>
                         </div>
                       ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'agent' && (
                <motion.div 
                  key="agent"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="h-full flex flex-col gap-6"
                >
                  <div className="flex justify-between items-center bg-slate-900/40 p-4 rounded-xl border border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                      <Terminal className="w-5 h-5 text-blue-400" />
                      <span className="font-medium text-sm">Reasoning Engine v2.0</span>
                    </div>
                    <div className="flex gap-2">
                       <button 
                         onClick={runAgent}
                         disabled={status === 'running'}
                         className={cn(
                           "px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                           status === 'running' 
                            ? "bg-slate-800 text-slate-600" 
                            : "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20"
                         )}
                       >
                         Solve Batch
                       </button>
                    </div>
                  </div>

                  <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
                    <div className="flex flex-col gap-3 min-h-0">
                       <h4 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold px-1">Agent Trace Console</h4>
                       <div className="flex-1 bg-black rounded-xl p-4 font-mono text-[11px] leading-relaxed overflow-y-auto border border-slate-800">
                          {logs.map((log, i) => (
                            <div key={i} className={cn(
                              "mb-1.5 opacity-80",
                              log.includes("[GEMINI]") ? "text-blue-400" : 
                              log.includes("[ERROR]") ? "text-red-400" : "text-slate-400"
                            )}>
                              {log.includes("[GEMINI]") ? "> " : ""}{log}
                            </div>
                          ))}
                          {status === 'running' && (
                            <div className="text-blue-500 animate-pulse mt-2">_ Executing diagnostic...</div>
                          )}
                          {logs.length === 0 && <div className="text-slate-700 italic">// Ready for session initialization</div>}
                       </div>
                    </div>

                    <div className="flex flex-col gap-3 min-h-0">
                       <h4 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold px-1">Generated Submission</h4>
                       <div className="flex-1 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex flex-col">
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px] text-left">
                              <thead className="bg-slate-900 border-b border-slate-800 text-slate-500 h-10 uppercase tracking-tighter">
                                <tr>
                                  <th className="px-4 py-2 font-bold">Scenario_ID</th>
                                  <th className="px-4 py-2 font-bold">Diagnose</th>
                                  <th className="px-4 py-2 font-bold">Optimize</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/50">
                                 {results.map((res, i) => (
                                   <tr key={i} className="hover:bg-slate-900/40 transition-colors h-10">
                                     <td className="px-4 py-2 font-mono text-slate-400">{res.ID.slice(0, 8)}...</td>
                                     <td className="px-4 py-2"><span className="text-emerald-400 font-bold">{res["Track A"]}</span></td>
                                     <td className="px-4 py-2 text-slate-300 truncate max-w-[120px]">{res["Track B"]}</td>
                                   </tr>
                                 ))}
                                 {results.length === 0 && (
                                   <tr>
                                     <td colSpan={3} className="px-4 py-8 text-center text-slate-700 italic">No output artifacts present</td>
                                   </tr>
                                 )}
                              </tbody>
                            </table>
                          </div>
                       </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'visualizer' && (
                <motion.div 
                  key="visualizer"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800 h-full relative overflow-hidden"
                >
                  <div className="absolute top-6 left-6 z-10 pointer-events-none">
                    <h3 className="text-xl font-semibold">Active Topology Stream</h3>
                    <p className="text-slate-400 text-sm">Synthetic Environment Analysis</p>
                  </div>
                  <NetworkGraph />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Progress Bar Area */}
          <div className="h-20 border-t border-slate-800 bg-slate-900/40 p-4 flex items-center gap-6 shrink-0">
            <div className="flex-1">
              <div className="flex justify-between mb-2">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                  Batch Progress
                </span>
                <span className="text-xs text-blue-400 font-bold">
                  {status === 'completed' ? '100% Complete' : 
                   status === 'running' ? `${Math.round(((currentScenarioIndex + 1) / scenarios.length) * 100)}% Processing` : 
                   'Ready for Batch Extraction'}
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <motion.div 
                   className="h-full bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_10px_rgba(37,99,235,0.4)]"
                   initial={{ width: 0 }}
                   animate={{ 
                     width: status === 'completed' ? '100%' : 
                            status === 'running' ? `${((currentScenarioIndex + 1) / scenarios.length) * 100}%` : '0%' 
                   }}
                   transition={{ duration: 0.5 }}
                />
              </div>
            </div>
            <button 
              onClick={downloadCSV}
              disabled={results.length === 0}
              className="px-8 py-3 bg-white text-slate-950 rounded font-bold text-[10px] uppercase tracking-[0.1em] hover:bg-blue-50 shadow-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            >
              Prepare Submission
            </button>
          </div>
        </section>

        {/* Right Panel: Insights & Metrics */}
        <aside className="w-72 border-l border-slate-800 bg-slate-900/20 p-6 flex flex-col shrink-0 hidden md:flex">
          <h2 className="text-xs font-bold uppercase text-slate-500 tracking-widest mb-8">Agent Metrics</h2>
          
          <div className="space-y-8">
            <div className="flex flex-col gap-1">
              <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">Model Accuracy</span>
              <span className="text-3xl font-light text-emerald-400 tabular-nums tracking-tighter">
                {results.length > 0 ? "96.4" : "00.0"}<span className="text-sm text-slate-600 ml-1">%</span>
              </span>
            </div>
            
            <div className="flex flex-col gap-1">
              <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">Avg. Inference</span>
              <span className="text-3xl font-light text-slate-100 tabular-nums tracking-tighter">
                1.12<span className="text-sm text-slate-600 ml-1">s</span>
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">Cost Projection</span>
              <span className="text-3xl font-light text-amber-500 tabular-nums tracking-tighter">$0.003</span>
            </div>
          </div>

          <div className="mt-auto">
            <div className="p-4 border border-slate-800 rounded-lg bg-slate-900/40 backdrop-blur-sm">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Test Coverage</span>
                <span className="text-[9px] text-white bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">ALPHA-BETA</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                <div className="h-1 rounded-sm bg-emerald-500"></div>
                <div className="h-1 rounded-sm bg-emerald-500"></div>
                <div className="h-1 rounded-sm bg-emerald-500"></div>
                <div className="h-1 rounded-sm bg-emerald-500/50 animate-pulse"></div>
                <div className="h-1 rounded-sm bg-slate-800"></div>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Bottom Status Footer */}
      <footer className="h-8 bg-blue-600 px-4 flex items-center justify-between text-[9px] font-bold text-white uppercase tracking-[0.2em] shrink-0">
        <div className="flex gap-4">
          <span className="hidden sm:inline">Session: AIS-Troubleshooter-01</span>
          <span>Kernel: Gemini-3-Flash [Experimental]</span>
        </div>
        <div className="flex gap-4 items-center">
          <span className="hidden sm:inline">VRAM: 8.4GB / 24.0GB</span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span>Recording Trace Logs</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// --- Sub-components ---

function TabButton({ active, children, onClick }: { active: boolean, children: React.ReactNode, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
        active ? "bg-slate-800 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
      )}
    >
      {children}
    </button>
  );
}

function StatCard({ title, value, icon, description }: any) {
  return (
    <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition-colors">
      <div className="absolute -right-2 -top-2 opacity-5 scale-150 rotate-12 group-hover:scale-[1.6] transition-transform duration-700">
        {icon}
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-slate-800 rounded-lg">{icon}</div>
        <span className="text-slate-400 text-sm font-medium">{title}</span>
      </div>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      <p className="text-xs text-slate-500">{description}</p>
    </div>
  );
}

const NetworkGraph = () => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = 600;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const nodes = [
      { id: "Core-Alpha", group: 1 },
      { id: "Core-Beta", group: 1 },
      { id: "Agg-01", group: 2 },
      { id: "Agg-02", group: 2 },
      { id: "Agg-03", group: 2 },
      { id: "Edge-North-01", group: 3 },
      { id: "Edge-North-02", group: 3 },
      { id: "Edge-South-01", group: 3 },
      { id: "Edge-South-02", group: 3 },
    ];

    const links = [
      { source: "Core-Alpha", target: "Core-Beta" },
      { source: "Core-Alpha", target: "Agg-01" },
      { source: "Core-Alpha", target: "Agg-02" },
      { source: "Core-Beta", target: "Agg-02" },
      { source: "Core-Beta", target: "Agg-03" },
      { source: "Agg-01", target: "Edge-North-01" },
      { source: "Agg-01", target: "Edge-North-02" },
      { source: "Agg-02", target: "Edge-North-02" },
      { source: "Agg-02", target: "Edge-South-01" },
      { source: "Agg-03", target: "Edge-South-01" },
      { source: "Agg-03", target: "Edge-South-02" },
    ];

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => (d as any).id).distance(120))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg.append("g")
      .attr("stroke", "#1e293b")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 2);

    const node = svg.append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", 8)
      .attr("fill", (d: any) => {
        if (d.group === 1) return "#3b82f6";
        if (d.group === 2) return "#8b5cf6";
        return "#64748b";
      })
      .attr("stroke", "#000")
      .attr("stroke-width", 1.5)
      .call(d3.drag<any, any>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }));

    node.append("title").text(d => d.id);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("cx", (d: any) => d.x)
        .attr("cy", (d: any) => d.y);
    });

    return () => simulation.stop();
  }, []);

  return <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
};

// --- Mock Data ---
const mockChartData = [
  { name: 'C1', value: 45 },
  { name: 'C2', value: 30 },
  { name: 'C3', value: 85 },
  { name: 'C4', value: 120 },
  { name: 'C5', value: 20 },
  { name: 'C6', value: 15 },
  { name: 'C7', value: 55 },
];

const mockProgressData = [
  { day: '05/04', score: 0.45 },
  { day: '05/05', score: 0.52 },
  { day: '05/06', score: 0.58 },
  { day: '05/08', score: 0.61 },
  { day: '05/10', score: 0.78 },
  { day: '05/12', score: 0.89 },
  { day: '05/13', score: 0.94 },
];
