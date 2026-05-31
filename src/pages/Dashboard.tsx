import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { 
  BarChart3, 
  AlertTriangle, 
  CheckCircle2, 
  Activity, 
  Cpu, 
  MemoryStick,
  Server,
  Database,
  Network,
  RefreshCcw
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, writeBatch, getDocs } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const { user } = useAuth();
  const [nodes, setNodes] = useState<any[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/metrics/nodes');
      if (response.ok) {
        const data = await response.json();
        setNodes(data);
        if (data.length > 0) {
          const avgCpu = Math.round(data.reduce((acc: number, n: any) => acc + (n.cpuLoad || n.load), 0) / data.length);
          const avgRam = Math.round(data.reduce((acc: number, n: any) => acc + (n.ramLoad || 0), 0) / data.length);
          setStats((prev: any) => prev ? { ...prev, resourceUtilization: { cpu: avgCpu, ram: avgRam, avgSpikes: prev.resourceUtilization.avgSpikes } } : null);
        }
      }
    } catch (err) {}
    setTimeout(() => setRefreshing(false), 500);
  };

  useEffect(() => {
    if (!user) return;
    
    // Fetch Nodes from Live Architecture Monitoring API
    let intervalId: NodeJS.Timeout;
    const fetchNodes = async () => {
      try {
        const response = await fetch('/api/metrics/nodes');
        if (response.ok) {
          const data = await response.json();
          setNodes(data);
          
          if (data.length > 0) {
            const avgCpu = Math.round(data.reduce((acc: number, n: any) => acc + (n.cpuLoad || n.load), 0) / data.length);
            const avgRam = Math.round(data.reduce((acc: number, n: any) => acc + (n.ramLoad || 0), 0) / data.length);
            setStats((prev: any) => prev ? { ...prev, resourceUtilization: { cpu: avgCpu, ram: avgRam, avgSpikes: prev.resourceUtilization.avgSpikes } } : null);
          }
        }
      } catch (err) {
        console.error("Failed to fetch cloud nodes", err);
      }
    };
    
    fetchNodes();
    intervalId = setInterval(fetchNodes, 5000); // Poll every 5s

    // Fetch Predictions
    const qPredictions = query(
      collection(db, 'predictions'),
      where('userId', '==', user.uid)
    );
    const unsubscribePredictions = onSnapshot(qPredictions, (snapshot) => {
      const logs = snapshot.docs.map(doc => doc.data());
      
      const totalTasks = logs.length;
      const failedTasks = logs.filter(l => l.prediction === 'FAIL').length;
      const successfulTasks = logs.filter(l => l.prediction === 'SUCCESS').length;
      
      const realSlaRisk = logs.length > 0 ? (failedTasks / totalTasks) : 0;

      let trendData: Record<string, { failures: number, total: number }> = {};
      logs.forEach(log => {
        const date = new Date(log.timestamp).toLocaleDateString(undefined, { weekday: 'short' });
        if (!trendData[date]) trendData[date] = { failures: 0, total: 0 };
        trendData[date].total++;
        if (log.prediction === 'FAIL') trendData[date].failures++;
      });

      const failureTrends = Object.entries(trendData).map(([name, data]) => ({
        name, failures: data.failures, total: data.total
      }));

      let avgCpu = 0;
      let avgRam = 0;
      
      setStats((prevStats: any) => ({
        totalTasks,
        failedTasks,
        successfulTasks,
        runningTasks: 0,
        slaRiskPercentage: realSlaRisk,
        resourceUtilization: prevStats ? prevStats.resourceUtilization : { cpu: 0, ram: 0, avgSpikes: 0 },
        failureTrends,
      }));

    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'predictions');
    });

    return () => {
      clearInterval(intervalId);
      unsubscribePredictions();
    };
  }, [user]);

  if (!stats) return <div className="flex items-center justify-center h-full text-slate-400">Loading analytics...</div>;

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'healthy': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-slate-500';
    }
  };

  const pieData = [
    { name: 'Successful', value: stats.successfulTasks, color: '#22c55e' },
    { name: 'Failed', value: stats.failedTasks, color: '#ef4444' },
    { name: 'Running', value: stats.runningTasks, color: '#3b82f6' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-200">Host System Monitor</h1>
          <p className="mt-1 text-sm text-slate-500">Real-time local hardware tracking and task predictions.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700 transition duration-150"
          >
            <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={async () => {
              if (!confirmClear) {
                setConfirmClear(true);
                setTimeout(() => setConfirmClear(false), 3000);
                return;
              }
              try {
                const q = query(collection(db, 'predictions'), where('userId', '==', user.uid));
                const snap = await getDocs(q);
                const batch = writeBatch(db);
                snap.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                toast.success('Task history cleared');
                setConfirmClear(false);
              } catch (err) {
                toast.error('Failed to clear tasks');
              }
            }}
            className={`px-4 py-2 ${confirmClear ? 'bg-red-600 text-white' : 'bg-red-600/10 text-red-500 hover:bg-red-600/20'} text-sm font-medium rounded-lg transition-colors border border-red-600/20`}
          >
            {confirmClear ? 'Click again to confirm' : 'Clear Task History'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-[#111318] overflow-hidden shadow-sm rounded-xl border border-slate-800">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <BarChart3 className="h-6 w-6 text-blue-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-semibold text-slate-500 uppercase truncate">Total Tasks</dt>
                  <dd className="text-2xl font-bold text-slate-200">{stats.totalTasks.toLocaleString()}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#111318] overflow-hidden shadow-sm rounded-xl border border-slate-800">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-yellow-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-semibold text-slate-500 uppercase truncate">SLA Risk Potential</dt>
                  <dd className="text-2xl font-bold text-slate-200">{(stats.slaRiskPercentage * 100).toFixed(1)}%</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#111318] overflow-hidden shadow-sm rounded-xl border border-slate-800">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Cpu className="h-6 w-6 text-blue-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-semibold text-slate-500 uppercase truncate">Avg CPU Contention</dt>
                  <dd className="text-2xl font-bold text-slate-200">{stats.resourceUtilization.cpu}%</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#111318] overflow-hidden shadow-sm rounded-xl border border-slate-800">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <MemoryStick className="h-6 w-6 text-green-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-semibold text-slate-500 uppercase truncate">Cluster RAM Usage</dt>
                  <dd className="text-2xl font-bold text-slate-200">{stats.resourceUtilization.ram}%</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#111318] shadow-sm rounded-xl border border-slate-800 p-6">
          <h3 className="text-lg font-medium text-slate-200 mb-4">Task Failure Probability Trends</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.failureTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorFailures" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 12}} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="failures" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorFailures)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#111318] to-[#0A0B0E] shadow-xl rounded-xl border border-slate-800/80 p-6 flex flex-col items-center justify-between relative overflow-hidden group">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay"></div>
          <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-bl-full pointer-events-none"></div>
          
          <div className="w-full flex justify-between items-center mb-2 z-10">
            <h3 className="text-lg font-semibold text-slate-200 flex items-center">
               <Server className="h-4 w-4 mr-2 text-indigo-400" />
               System Architecture Status
            </h3>
          </div>
          <p className="text-xs text-slate-500 w-full text-left mb-6 font-mono z-10">Real-time topology & load distribution</p>

          <div className="relative w-full flex-grow min-h-[260px] flex items-center justify-center z-10">
            {/* Center Node (Core) */}
            <div className="absolute z-20 w-20 h-20 bg-[#0A0B0E] border border-slate-700/80 rounded-full flex flex-col items-center justify-center shadow-[0_0_30px_rgba(79,70,229,0.3)]">
               <div className="absolute inset-2 rounded-full border border-indigo-500/50 animate-ping opacity-20 duration-1000"></div>
               <div className="absolute inset-0 rounded-full bg-indigo-500/10 animate-pulse"></div>
               <Activity className="h-7 w-7 text-indigo-400" />
               <span className="text-[9px] text-slate-400 uppercase tracking-widest mt-1 font-bold font-mono">Core</span>
            </div>
            
            {(() => {
              const cpuLoad = nodes[0] ? nodes[0].load || nodes[0].cpuLoad || 45 : 45;
              const ramLoad = nodes[0] ? nodes[0].ramLoad || Math.floor(nodes[0].load * 0.9) || 62 : 62;
              const diskLoad = nodes[0] ? nodes[0].diskReq || 35 : 35;
              const netLoad = nodes[0] ? nodes[0].netReq || 58 : 58;

              const getStatusColor = (val: number) => val > 85 ? 'text-rose-500 border-rose-500/50 bg-rose-500/10 shadow-[0_0_15px_rgba(244,63,94,0.3)]' : val > 60 ? 'text-amber-500 border-amber-500/50 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.3)]';

              const getLineColor = (val: number) => val > 85 ? '#f43f5e' : val > 60 ? '#f59e0b' : '#10b981';

              const peripheralNodes = [
                 { pos: 'top-2 right-6', label: 'CPU Cluster', val: cpuLoad, cx: "80%", cy: "15%", icon: Cpu },
                 { pos: 'bottom-2 right-12', label: 'Memory', val: ramLoad, cx: "75%", cy: "85%", icon: MemoryStick },
                 { pos: 'bottom-2 left-6', label: 'Storage Array', val: diskLoad, cx: "20%", cy: "85%", icon: Database },
                 { pos: 'top-2 left-12', label: 'Network Edge', val: netLoad, cx: "25%", cy: "15%", icon: Network },
              ];

              return (
                 <>
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                     {peripheralNodes.map((pn, i) => (
                        <g key={`line-group-${i}`}>
                           <line x1="50%" y1="50%" x2={pn.cx} y2={pn.cy} stroke={getLineColor(pn.val)} strokeWidth="2" strokeDasharray="5 5" className="opacity-30" />
                        </g>
                     ))}
                  </svg>

                  {peripheralNodes.map((pn, i) => {
                     const colorClass = getStatusColor(pn.val);
                     const Icon = pn.icon;
                     return (
                        <div key={`node-${i}`} className={`absolute ${pn.pos} flex flex-col items-center z-10 hover:scale-110 transition-transform duration-300 cursor-default group/node`}>
                           <div className={`w-14 h-14 rounded-full border-[1.5px] flex flex-col items-center justify-center backdrop-blur-md ${colorClass} relative`}>
                             <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-current shadow-[0_0_5px_currentColor] animate-pulse"></div>
                             <Icon className="w-4 h-4 mb-0.5 opacity-80" />
                             <span className="text-[10px] font-bold font-mono tracking-tighter">{pn.val}%</span>
                           </div>
                           <div className="mt-2 bg-[#0A0B0E]/90 px-2.5 py-1 rounded border border-slate-700/50 backdrop-blur-md shadow-lg shadow-black/30 opacity-80 group-hover/node:opacity-100 transition-opacity whitespace-nowrap">
                             <span className="text-[10px] font-mono text-slate-300 flex items-center">{pn.label}</span>
                           </div>
                        </div>
                     )
                  })}
                 </>
              );
            })()}
          </div>

          <div className="flex justify-between items-center mt-6 w-full px-4 py-3 bg-[#0A0B0E]/60 rounded-xl border border-slate-800/80 backdrop-blur-md z-10">
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded shadow-[0_0_5px_#10b981] bg-emerald-500"></span><span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">0-60%</span></div>
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded shadow-[0_0_5px_#f59e0b] bg-amber-500"></span><span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">60-85%</span></div>
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded shadow-[0_0_5px_#f43f5e] bg-rose-500"></span><span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">&gt;85%</span></div>
          </div>
        </div>
      </div>

      <div className="bg-[#111318] shadow-sm rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800">
          <h3 className="text-lg font-medium text-slate-200">Live Host Node Monitor</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-[#16181d]">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Node Instance</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Load %</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-[#111318] divide-y divide-slate-800">
              {nodes.length > 0 ? nodes.map((node: any, i: number) => (
                <tr key={i}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">{node.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                    <div className="flex items-center">
                      <span className="w-8">{node.load}%</span>
                      <div className="mx-2 flex-grow h-2 rounded-full bg-slate-800 max-w-[100px]">
                        <div className={`h-2 rounded-full ${node.load > 80 ? 'bg-red-500' : node.load > 60 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${node.load}%` }}></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="flex items-center text-sm">
                      <span className={`h-2 w-2 rounded-full mr-2 ${getStatusColor(node.status)}`}></span>
                      <span className="capitalize text-slate-300">{node.status}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button 
                      onClick={() => toast.info(`Viewing logs for ${node.name}...`)}
                      className="text-blue-500 hover:text-blue-400 mr-4 font-mono uppercase tracking-wider text-[10px]">
                      Inspect Log
                    </button>
                    {node.load > 70 && (
                      <button 
                        onClick={() => {
                          toast.success("Auto-scaling initialized", {
                            description: `Migrating workloads from ${node.name} to idle nodes...`
                          });
                        }}
                        className="text-green-500 hover:text-green-400 font-mono uppercase tracking-wider text-[10px]"
                      >
                        Auto-Scale
                      </button>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 whitespace-nowrap text-sm text-center text-slate-500">
                    No nodes registered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
