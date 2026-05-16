import { Bell, Search, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

export default function Navbar() {
  const handleNotificationClick = () => {
    toast.info("System Notification", {
      description: "Auto-scaled cluster Alpha-01 based on GRU prediction."
    });
  };

  return (
    <header className="h-16 bg-[#0A0B0E] border-b border-slate-800 flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center">
        <button className="md:hidden p-2 -ml-2 text-slate-500 hover:text-slate-300">
          <Menu className="h-6 w-6" />
        </button>
        <div className="hidden sm:flex relative ml-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search tasks, nodes, models..." 
            className="pl-9 pr-4 py-1.5 bg-[#111318] border border-slate-800 rounded-full text-sm text-slate-200 focus:ring-1 focus:ring-blue-500 focus:bg-[#16181d] outline-none w-64 transition-all"
          />
        </div>
      </div>
      <div className="flex items-center space-x-6">
        <div className="flex items-center gap-2 text-xs font-mono hidden sm:flex border-r border-slate-800 pr-6 mr-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
          <span className="text-slate-200">LIVE DATA STREAM</span>
        </div>
        <button onClick={handleNotificationClick} className="relative p-2 text-slate-400 hover:text-slate-200">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[#0A0B0E]"></span>
        </button>
      </div>
    </header>
  );
}
