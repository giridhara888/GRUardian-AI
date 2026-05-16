import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import ChatAssistant from './ChatAssistant';

export default function Layout() {
  return (
    <div className="flex h-screen bg-[#0A0B0E] text-slate-200 font-sans overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#0A0B0E]">
          <Outlet />
        </main>
      </div>
      <ChatAssistant />
    </div>
  );
}
