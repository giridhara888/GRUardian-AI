import React, { useState, useEffect } from 'react';
import { Users, Database, Server, Settings, Activity, RefreshCcw, Download, Terminal } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { toast } from 'sonner';
import { db } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

export default function Admin() {
  const { user } = useAuth();
  const [retraining, setRetraining] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'predictions'),
      where('userId', '==', user.uid),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newLogs = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      // Sort client-side to avoid requiring a composite index
      newLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setLogs(newLogs.slice(0, 5));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'predictions');
    });

    return () => unsubscribe();
  }, [user]);

  if (user?.role !== 'admin') {
    return <div className="text-center p-8 text-rose-500">Access Denied</div>;
  }

  const handleRetrain = () => {
    setRetraining(true);
    toast.info("Retraining Job Initialized", {
      description: "Fetching new datasets from telemetry..."
    });
    setTimeout(() => {
      setRetraining(false);
      toast.success("Model Retrained Successfully", {
        description: "New GRU model achieved 98.7% accuracy on validation set. Deployed to production."
      });
    }, 4000);
  };

  const performanceData = [
    { time: '00:00', api: 120, db: 45, logs: 890 },
    { time: '04:00', api: 240, db: 60, logs: 1200 },
    { time: '08:00', api: 180, db: 85, logs: 2400 },
    { time: '12:00', api: 450, db: 110, logs: 3200 },
    { time: '16:00', api: 380, db: 90, logs: 2800 },
    { time: '20:00', api: 150, db: 55, logs: 1500 },
    { time: '24:00', api: 130, db: 40, logs: 950 },
  ];

  const users = [
    { id: 1, email: 'admin@cloudpred.ai', role: 'Admin', lastActive: '2 mins ago', status: 'Active' },
    { id: 2, email: 'research@cloudpred.ai', role: 'Research Data Scientist', lastActive: '1 hour ago', status: 'Active' },
    { id: 3, email: 'devops@cloudpred.ai', role: 'DevOps Engineer', lastActive: '2 days ago', status: 'Inactive' },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-200">Admin Panel</h1>
        <p className="mt-1 text-sm text-slate-500">System configuration and user management.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { name: 'Total Users', value: '12', icon: Users, color: 'text-blue-500' },
          { name: 'Active Models', value: '4', icon: Server, color: 'text-green-500' },
          { name: 'Datasets Indexed', value: '24 GB', icon: Database, color: 'text-yellow-500' },
          { name: 'System Load', value: 'Low', icon: Settings, color: 'text-blue-400' },
        ].map((stat) => (
          <div key={stat.name} className="bg-[#111318] overflow-hidden shadow-sm rounded-xl border border-slate-800 p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-semibold text-slate-500 uppercase truncate">{stat.name}</dt>
                  <dd className="text-xl font-bold text-slate-200 mt-1">{stat.value}</dd>
                </dl>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        {/* Real-Time Monitoring */}
        <div className="bg-[#111318] shadow-sm rounded-xl border border-slate-800 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-bold text-slate-200 flex items-center">
              <Activity className="h-4 w-4 mr-2 text-blue-500" /> System Performance
            </h3>
            <span className="flex items-center text-[10px] uppercase font-bold text-green-500 bg-green-500/10 px-2 py-1 border border-green-500/20 rounded-md tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse"></span>
              Live
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-[#1a1c22] rounded-lg p-3 border border-slate-800/50">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Avg API Latency</p>
              <p className="text-2xl font-mono text-slate-200">142<span className="text-sm text-slate-500 ml-1">ms</span></p>
            </div>
            <div className="bg-[#1a1c22] rounded-lg p-3 border border-slate-800/50">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">DB Load</p>
              <p className="text-2xl font-mono text-slate-200">68<span className="text-sm text-slate-500 ml-1">%</span></p>
            </div>
          </div>

          <div className="flex-1 min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorApi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" opacity={0.5} />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1a1c22', borderColor: '#1e293b', borderRadius: '8px', color: '#e2e8f0', fontSize: '12px' }}
                  itemStyle={{ color: '#94a3b8' }}
                />
                <Area type="monotone" dataKey="api" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorApi)" name="API Response (ms)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Model Retraining Pipeline */}
        <div className="bg-[#111318] shadow-sm rounded-xl border border-slate-800 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-bold text-slate-200 flex items-center">
              <RefreshCcw className="h-4 w-4 mr-2 text-yellow-500" /> Model Retraining Pipeline
            </h3>
          </div>
          
          <div className="bg-[#1a1c22] rounded-lg border border-slate-800 mb-6 p-4">
            <div className="flex items-start">
              <div className="bg-yellow-500/10 p-2 rounded-lg border border-yellow-500/20 mr-4">
                <Database className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <h4 className="text-sm text-slate-200 font-bold mb-1">New Telemetry Data Available</h4>
                <p className="text-xs text-slate-400 mb-2">12,450 new failure logs have been indexed since the last model deployment. Model drift detected: <span className="text-red-400 font-mono">-2.4%</span></p>
                <span className="inline-block px-2 py-1 bg-slate-800 text-slate-300 text-[10px] font-mono rounded">
                  Dataset: GRU_Telemetry_v4_delta
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 mt-auto space-y-3">
             <button 
                onClick={handleRetrain}
                disabled={retraining}
                className="w-full flex justify-center items-center rounded-lg border border-transparent bg-yellow-600/20 py-3 px-4 text-sm font-bold uppercase tracking-wider text-yellow-500 border-yellow-600/30 shadow-sm hover:bg-yellow-600/30 focus:outline-none disabled:opacity-50 transition-colors"
                >
                {retraining ? <RefreshCcw className="h-4 w-4 animate-spin mr-2" /> : <Settings className="h-4 w-4 mr-2" />}
                {retraining ? 'Retraining in Progress...' : 'Initialize Retraining Job'}
             </button>
             <button className="w-full flex justify-center items-center rounded-lg border border-slate-700 bg-transparent py-3 px-4 text-sm font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 hover:bg-slate-800 focus:outline-none transition-colors">
                <Download className="h-4 w-4 mr-2" />
                Export Drift Analysis
             </button>
          </div>
        </div>
      </div>

      <div className="bg-[#111318] shadow-sm rounded-xl border border-slate-800 overflow-hidden mt-8">
        <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-200">User Management</h3>
          <button className="px-4 py-2 bg-blue-600 text-white text-sm font-bold uppercase tracking-wider rounded-md hover:bg-blue-700 transition-colors">
            Invite User
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-[#16181d]">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">User</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Role</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Last Active</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-[#111318] divide-y divide-slate-800">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-200">{u.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{u.role}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase font-bold ${u.status === 'Active' ? 'bg-green-900/50 text-green-200 border border-green-500/30' : 'bg-[#1a1c22] text-slate-400 border border-slate-800'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-xs font-mono">{u.lastActive}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button className="text-blue-500 hover:text-blue-400 mr-4 uppercase text-[10px] font-bold tracking-wider">Edit</button>
                    <button className="text-red-500 hover:text-red-400 uppercase text-[10px] font-bold tracking-wider">Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[#111318] shadow-sm rounded-xl border border-slate-800 overflow-hidden mt-8">
        <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-200 flex items-center">
            <Terminal className="h-4 w-4 mr-2 text-blue-500" /> Historical Prediction Analysis
          </h3>
          <button className="px-4 py-2 bg-[#1a1c22] border border-slate-700 text-slate-300 text-[10px] font-bold uppercase tracking-wider rounded-md hover:bg-slate-800 transition-colors">
            View All Logs
          </button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-[#16181d] p-4 rounded-lg border border-slate-800/50">
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Total Predictions (30d)</p>
              <p className="text-2xl font-mono text-slate-200 mt-2">1,245,091</p>
            </div>
            <div className="bg-[#16181d] p-4 rounded-lg border border-slate-800/50">
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">True Positives (Failure Caught)</p>
              <p className="text-2xl font-mono text-green-500 mt-2">18,342</p>
            </div>
            <div className="bg-[#16181d] p-4 rounded-lg border border-slate-800/50">
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">False Positives</p>
              <p className="text-2xl font-mono text-yellow-500 mt-2">412</p>
            </div>
          </div>
          <div className="bg-[#16181d] rounded-lg border border-slate-800/50 p-1">
             <div className="px-4 py-3 border-b border-slate-800/50">
                <span className="text-xs text-slate-400 font-mono">SELECT timestamp, prediction, confidence FROM inference_logs ORDER BY timestamp DESC LIMIT 3;</span>
             </div>
             <div className="divide-y divide-slate-800/50">
                {logs.length > 0 ? logs.map((log, i) => (
                  <div key={i} className="flex justify-between items-center px-4 py-3 hover:bg-slate-800/30 transition-colors">
                    <span className="text-xs text-slate-500 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className={`text-xs font-bold uppercase tracking-wider ${log.prediction === 'FAIL' ? 'text-red-400' : 'text-green-400'}`}>{log.prediction}</span>
                    <span className="text-xs text-slate-300 font-mono">{log.confidence}</span>
                    <span className="text-xs max-w-[80px] w-full text-right">
                       {log.correct ? <span className="text-green-500 font-bold tracking-wider text-[10px] uppercase">Validated</span> : <span className="text-red-500 font-bold tracking-wider text-[10px] uppercase">Drift</span>}
                    </span>
                  </div>
                )) : (
                  <div className="px-4 py-6 text-center text-xs text-slate-500">
                    No prediction logs found in Firestore.
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>

      <div className="bg-[#111318] shadow-sm rounded-xl border border-slate-800 overflow-hidden mt-8">
        <div className="px-6 py-5 border-b border-slate-800">
          <h3 className="text-sm font-bold text-slate-200">Automated Remediation Policies</h3>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h4 className="text-slate-200 font-medium">Auto-Scaling Trigger</h4>
              <p className="text-sm text-slate-500 mt-1">Automatically scale nodes if load exceeds threshold.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h4 className="text-slate-200 font-medium">SLA Violation Auto-Requeue</h4>
              <p className="text-sm text-slate-500 mt-1">Restart tasks predicted to violate SLA before failure.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between pb-4">
            <div>
              <h4 className="text-slate-200 font-medium">Data Pipeline Auto-Retraining</h4>
              <p className="text-sm text-slate-500 mt-1">Automatically kick off deep learning retraining if daily accuracy falls below 95%.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between border-t border-slate-800 pt-4">
            <div>
              <h4 className="text-slate-200 font-medium">Historical Prediction Log Archives</h4>
              <p className="text-sm text-slate-500 mt-1">Automatically prune historical prediction inference logs older than 30 days.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
