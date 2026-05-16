import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { 
  BarChart3, 
  AlertTriangle, 
  CheckCircle2, 
  Activity, 
  Cpu, 
  MemoryStick
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const { user } = useAuth();
  const [nodes, setNodes] = useState<any[]>([]);

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

        <div className="bg-[#111318] shadow-sm rounded-xl border border-slate-800 p-6 flex flex-col items-center justify-center">
          <h3 className="text-lg font-medium text-slate-200 mb-6 w-full text-left">System Architecture Status</h3>
          <div className="relative w-full h-64 flex items-center justify-center">
            {/* Center Node */}
            <div className="absolute z-10 w-16 h-16 bg-blue-600/20 border-2 border-blue-500 rounded-full flex flex-col items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)]">
              <Activity className="h-6 w-6 text-blue-400" />
            </div>
            
            {/* Outline nodes positioned absolutely */}
            {[
              { pos: 'top-2 right-12', label: 'CPU', color: 'border-blue-500 text-blue-500', load: nodes[0] ? `${nodes[0].cpuLoad}%` : '0%' },
              { pos: 'bottom-2 right-12', label: 'RAM', color: 'border-green-500 text-green-500', load: nodes[0] ? `${nodes[0].ramLoad}%` : '0%' },
            ].map((n, i) => (
               <div key={i} className={`absolute ${n.pos} flex flex-col items-center`}>
                  <div className={`w-10 h-10 bg-slate-800/50 border-2 ${n.color} rounded-full flex items-center justify-center`}>
                    <span className="text-[10px] font-bold">{n.load}</span>
                  </div>
                  <span className="text-[10px] font-mono mt-1 text-slate-400">{n.label}</span>
               </div>
            ))}

            {/* SVG lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
               <line x1="50%" y1="50%" x2="70%" y2="20%" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 4"/>
               <line x1="50%" y1="50%" x2="75%" y2="80%" stroke="#22c55e" strokeWidth="2" />
            </svg>
          </div>
          <div className="w-full flex justify-between mt-4">
            <div className="flex items-center gap-2 text-xs text-slate-400"><span className="w-2 h-2 rounded-full bg-green-500"></span> 0-60%</div>
            <div className="flex items-center gap-2 text-xs text-slate-400"><span className="w-2 h-2 rounded-full bg-yellow-500"></span> 60-90%</div>
            <div className="flex items-center gap-2 text-xs text-slate-400"><span className="w-2 h-2 rounded-full bg-red-500"></span> &gt;90%</div>
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
