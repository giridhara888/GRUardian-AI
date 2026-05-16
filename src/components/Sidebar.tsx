import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Database, 
  BrainCircuit, 
  ActivitySquare, 
  ShieldAlert,
  LogOut
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Datasets', href: '/datasets', icon: Database },
    { name: 'Models', href: '/models', icon: BrainCircuit },
    { name: 'Predict', href: '/predict', icon: ActivitySquare },
  ];

  if (user?.role === 'admin') {
    navItems.push({ name: 'Admin', href: '/admin', icon: ShieldAlert });
  }

  return (
    <div className="w-64 bg-[#111318] flex flex-col hidden md:flex border-r border-slate-800">
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <ActivitySquare className="h-6 w-6 text-blue-500 mr-2" />
        <span className="font-bold text-lg tracking-tight">CloudPred<span className="text-blue-500">AI</span></span>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold px-2 mb-4">Core Modules</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors",
                  isActive 
                    ? "bg-blue-600/10 text-blue-400 border border-blue-600/20" 
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                )}
              >
                <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 bg-[#1a1c22] mx-4 my-2 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium uppercase">Host System Edge</span>
          <span className="flex h-2 w-2 rounded-full bg-green-500"></span>
        </div>
      </div>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center text-sm">
          <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center font-bold mr-3 flex-shrink-0 text-white">
            {user?.email.charAt(0).toUpperCase()}
          </div>
          <div className="truncate flex-1">
            <p className="text-slate-200 truncate">{user?.email}</p>
            <p className="text-slate-500 text-xs capitalize">{user?.role}</p>
          </div>
        </div>
        <button 
          onClick={logout}
          className="mt-4 flex items-center w-full px-3 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
        >
          <LogOut className="mr-3 h-4 w-4" />
          Logout
        </button>
      </div>
    </div>
  );
}
