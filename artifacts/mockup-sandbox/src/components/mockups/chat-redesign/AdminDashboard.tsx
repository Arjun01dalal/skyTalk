import React from 'react';
import {
  MessageSquare,
  Phone,
  Activity,
  Users,
  Bot,
  Settings,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Bell,
  MoreHorizontal,
  Circle,
  LayoutGrid,
  Filter,
  Sparkles
} from 'lucide-react';

export const AdminDashboard = () => {
  return (
    <div className="flex h-screen w-full bg-[#F8FAFC] font-sans text-slate-900 overflow-hidden relative">
      {/* Subtle Background Gradients for Elevated Feel */}
      <div className="absolute top-[-10%] left-[20%] w-[50vw] h-[50vw] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[40vw] h-[40vw] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Sidebar Navigation */}
      <aside className="w-[72px] bg-[#0B1121] flex flex-col items-center py-6 border-r border-slate-800 z-10 shrink-0">
        <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center mb-8 shadow-lg shadow-indigo-500/20">
          <MessageSquare className="w-5 h-5 text-white" />
        </div>
        
        <nav className="flex flex-col gap-4 w-full px-3">
          <NavItem icon={<MessageSquare />} label="Messages" />
          <NavItem icon={<Phone />} label="Calls" />
          <NavItem icon={<Activity />} label="Monitor" active />
          <NavItem icon={<Users />} label="Directory" />
          <NavItem icon={<Bot />} label="AI Support" />
        </nav>

        <div className="mt-auto flex flex-col gap-4 w-full px-3">
          <NavItem icon={<Settings />} label="Admin" />
          <div className="h-10 w-full flex items-center justify-center mt-2 cursor-pointer group">
            <div className="w-8 h-8 rounded-full border border-slate-600 bg-slate-800 flex items-center justify-center text-xs font-semibold text-slate-300 group-hover:border-slate-400 group-hover:text-white transition-all">
              AD
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden z-10">
        {/* Header */}
        <header className="h-20 px-8 flex items-center justify-between border-b border-slate-200/50 bg-white/40 backdrop-blur-xl shrink-0">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Monitor & Analytics</h1>
            <p className="text-sm text-slate-500 font-medium mt-0.5">Real-time overview of your support operations</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Search chats, agents..." 
                className="pl-9 pr-4 py-2 bg-white/80 backdrop-blur-sm border border-slate-200/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-64 shadow-sm transition-all"
              />
            </div>
            <button className="relative p-2.5 text-slate-400 hover:text-slate-600 transition-colors bg-white/80 backdrop-blur-sm border border-slate-200/80 rounded-xl shadow-sm hover:shadow">
              <Bell className="w-4 h-4" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
            </button>
            <button className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-xl shadow-sm transition-all flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-slate-400" />
              Export Report
            </button>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-[1600px] mx-auto space-y-8">
            
            {/* Stat Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-5">
              <StatCard 
                title="Active Support Team" 
                value="4" 
                delta="+1 this hour"
                trend="up"
                icon={<Users className="w-5 h-5 text-blue-600" />}
                iconBg="bg-blue-50"
                sparkline={<Sparkline id="sp1" color="#2563eb" stopColor="#3b82f6" data="M 0 25 L 20 25 L 40 15 L 60 15 L 80 5 L 100 5" />}
              />
              <StatCard 
                title="Today Total Chat" 
                value="128" 
                delta="+14% vs yesterday"
                trend="up"
                icon={<MessageSquare className="w-5 h-5 text-indigo-600" />}
                iconBg="bg-indigo-50"
                sparkline={<Sparkline id="sp2" color="#4f46e5" stopColor="#6366f1" data="M 0 20 L 20 22 L 40 15 L 60 18 L 80 8 L 100 5" />}
              />
              <StatCard 
                title="Unread / Unique" 
                value="23 / 61" 
                delta="-5% response time"
                trend="down"
                icon={<Activity className="w-5 h-5 text-rose-600" />}
                iconBg="bg-rose-50"
                sparkline={<Sparkline id="sp3" color="#e11d48" stopColor="#f43f5e" data="M 0 5 L 20 10 L 40 8 L 60 20 L 80 18 L 100 25" />}
              />
              <StatCard 
                title="Today Recordings" 
                value="0" 
                delta="System paused"
                trend="neutral"
                icon={<Phone className="w-5 h-5 text-amber-600" />}
                iconBg="bg-amber-50"
                sparkline={<Sparkline id="sp4" color="#d97706" stopColor="#f59e0b" data="M 0 28 L 100 28" />}
              />
              <StatCard 
                title="Total Communication" 
                value="1,204" 
                delta="+8% vs last week"
                trend="up"
                icon={<LayoutGrid className="w-5 h-5 text-emerald-600" />}
                iconBg="bg-emerald-50"
                sparkline={<Sparkline id="sp5" color="#16a34a" stopColor="#22c55e" data="M 0 25 L 20 20 L 40 22 L 60 10 L 80 15 L 100 2" />}
              />
            </div>

            {/* Main Dash Area */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              
              {/* Active Agents */}
              <div className="xl:col-span-1 bg-white/70 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm flex flex-col">
                <div className="p-5 border-b border-slate-100/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-slate-900 tracking-tight">Active Agents</h2>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  </div>
                  <button className="text-slate-400 hover:text-slate-600 transition-colors">
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-3 flex flex-col gap-1 overflow-y-auto">
                  <AgentRow name="Sarah Jenkins" role="Tier 2 Support" status="online" chats={3} avatar="SJ" />
                  <AgentRow name="Michael Chen" role="Technical" status="online" chats={2} avatar="MC" />
                  <AgentRow name="AI Assistant" role="Bot" status="ai" chats={45} avatar="AI" />
                  <AgentRow name="Emma Wilson" role="Billing" status="busy" chats={4} avatar="EW" />
                  <AgentRow name="David Kumar" role="Tier 1 Support" status="offline" chats={0} avatar="DK" />
                </div>
                <div className="p-4 mt-auto border-t border-slate-100/50 bg-slate-50/50 rounded-b-2xl">
                  <button className="w-full py-2 text-sm text-slate-600 font-medium hover:text-indigo-600 hover:bg-white rounded-lg transition-all border border-transparent hover:border-slate-200 hover:shadow-sm">
                    View All Agents
                  </button>
                </div>
              </div>

              {/* Live Conversations */}
              <div className="xl:col-span-2 bg-white/70 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm flex flex-col overflow-hidden">
                <div className="p-5 border-b border-slate-100/50 flex items-center justify-between bg-white/30">
                  <div className="flex items-center gap-3">
                    <h2 className="font-semibold text-slate-900 tracking-tight">Live Conversations</h2>
                    <span className="px-2.5 py-1 rounded-md bg-indigo-50/80 text-indigo-700 text-xs font-semibold border border-indigo-100">
                      61 Active
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow transition-all">
                      <Filter className="w-3.5 h-3.5" />
                      Filter
                    </button>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50/30 text-slate-500 font-medium text-xs uppercase tracking-wider border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 font-semibold">User</th>
                        <th className="px-6 py-4 font-semibold">Assignee</th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                        <th className="px-6 py-4 font-semibold">Wait Time</th>
                        <th className="px-6 py-4 font-semibold">Last Message</th>
                        <th className="px-6 py-4 font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/60">
                      <ConversationRow 
                        user={{ name: "Alex Thompson", email: "alex@example.com", init: "AT" }}
                        assignee={{ name: "Sarah Jenkins", isAi: false }}
                        status="active"
                        waitTime="2m"
                        lastMsg="I need help resetting my password..."
                      />
                      <ConversationRow 
                        user={{ name: "Maria Garcia", email: "maria.g@acme.co", init: "MG", highlight: true }}
                        assignee={{ name: "AI Support", isAi: true }}
                        status="resolving"
                        waitTime="—"
                        lastMsg="Here is the link to our billing portal."
                      />
                      <ConversationRow 
                        user={{ name: "James Wilson", email: "j.wilson@tech.io", init: "JW" }}
                        assignee={{ name: "Michael Chen", isAi: false }}
                        status="waiting"
                        waitTime="4m"
                        lastMsg="The API endpoint is returning a 500 error."
                      />
                      <ConversationRow 
                        user={{ name: "Sophie Martin", email: "smartin@design.co", init: "SM" }}
                        assignee={{ name: "AI Support", isAi: true }}
                        status="active"
                        waitTime="—"
                        lastMsg="Let me check the shipping status for you."
                      />
                      <ConversationRow 
                        user={{ name: "Unknown Visitor", email: "Browsing Pricing", init: "?" }}
                        assignee={{ name: "Unassigned", isAi: false }}
                        status="new"
                        waitTime="30s"
                        lastMsg="Can someone tell me about enterprise pricing?"
                      />
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>

      {/* Basic local styles for scrollbar */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(148, 163, 184, 0.3);
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(148, 163, 184, 0.5);
        }
      `}} />
    </div>
  );
};

// --- Helper Components ---

const Sparkline = ({ color, stopColor, data, id }: { color: string, stopColor: string, data: string, id: string }) => (
  <svg className="w-full h-12 mt-4" viewBox="0 0 100 30" preserveAspectRatio="none">
    <defs>
      <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor={stopColor} stopOpacity="0.25" />
        <stop offset="100%" stopColor={stopColor} stopOpacity="0" />
      </linearGradient>
    </defs>
    <path
      d={`${data} L 100 30 L 0 30 Z`}
      fill={`url(#${id})`}
    />
    <path
      d={data}
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const NavItem = ({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) => {
  return (
    <button 
      className={`relative group flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 ${
        active 
          ? 'bg-indigo-500/15 text-indigo-400' 
          : 'text-slate-500 hover:bg-slate-800/80 hover:text-slate-300'
      }`}
      title={label}
    >
      {active && (
        <span className="absolute left-[-12px] top-1/2 -translate-y-1/2 w-1.5 h-6 bg-indigo-500 rounded-r-full" />
      )}
      <div className={`[&>svg]:w-[22px] [&>svg]:h-[22px] ${active ? 'scale-110' : 'group-hover:scale-110'} transition-transform duration-300`}>
        {icon}
      </div>
      
      {/* Tooltip */}
      <div className="absolute left-16 px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 translate-x-[-10px] group-hover:translate-x-0 z-50 shadow-xl border border-slate-700/50 whitespace-nowrap">
        {label}
      </div>
    </button>
  );
};

const StatCard = ({ title, value, delta, trend, icon, iconBg, sparkline }: any) => {
  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-5 pb-12 border border-slate-200/60 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] relative group hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.1)] hover:border-slate-300/60 transition-all duration-300 overflow-hidden cursor-default flex flex-col">
      <div className="flex justify-between items-start mb-5 z-10">
        <div className={`p-2.5 rounded-xl ${iconBg} ring-1 ring-black/5`}>
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md ${
          trend === 'up' ? 'text-emerald-700 bg-emerald-50 border border-emerald-100/50' : 
          trend === 'down' ? 'text-rose-700 bg-rose-50 border border-rose-100/50' : 
          'text-slate-600 bg-slate-100 border border-slate-200/50'
        }`}>
          {trend === 'up' ? <ArrowUpRight className="w-3 h-3 stroke-[3]" /> : 
           trend === 'down' ? <ArrowDownRight className="w-3 h-3 stroke-[3]" /> : 
           null}
          {delta}
        </div>
      </div>
      
      <div className="z-10 mt-auto">
        <h3 className="text-slate-500 text-xs font-semibold mb-1 uppercase tracking-wider">{title}</h3>
        <div className="text-2xl font-bold text-slate-900 tracking-tight">{value}</div>
      </div>
      
      <div className="absolute bottom-[-5px] left-0 right-0 opacity-60 group-hover:opacity-100 group-hover:translate-y-[-2px] transition-all duration-500 ease-out">
        {sparkline}
      </div>
    </div>
  );
};

const AgentRow = ({ name, role, status, chats, avatar }: any) => {
  const statusColors = {
    online: 'bg-emerald-500',
    busy: 'bg-amber-500',
    offline: 'bg-slate-300',
    ai: 'bg-violet-500'
  };

  return (
    <div className="flex items-center gap-3 p-2.5 hover:bg-slate-50/80 rounded-xl transition-colors cursor-pointer group">
      <div className="relative">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm ring-1 ring-black/5 ${
          status === 'ai' ? 'bg-gradient-to-br from-violet-100 to-indigo-50 text-violet-700' : 'bg-slate-100 text-slate-600'
        }`}>
          {status === 'ai' ? <Bot className="w-5 h-5" /> : avatar}
        </div>
        <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-[2.5px] border-white ${statusColors[status as keyof typeof statusColors]}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-0.5">
          <h4 className="text-sm font-semibold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
            {name}
          </h4>
          <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md shadow-sm">
            {chats} chats
          </span>
        </div>
        <div className="text-xs text-slate-500 truncate flex items-center gap-1.5 font-medium">
          {status === 'ai' && <Sparkles className="w-3 h-3 text-violet-500 fill-violet-500/20" />}
          {role}
        </div>
      </div>
    </div>
  );
};

const ConversationRow = ({ user, assignee, status, waitTime, lastMsg, highlight }: any) => {
  const getStatusBadge = (s: string) => {
    switch(s) {
      case 'active': return <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100/80 uppercase tracking-wide"><Circle className="w-2 h-2 fill-emerald-500 text-emerald-500" /> Active</span>;
      case 'resolving': return <span className="flex items-center gap-1.5 text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100/80 uppercase tracking-wide"><Circle className="w-2 h-2 fill-blue-500 text-blue-500" /> Resolving</span>;
      case 'waiting': return <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-100/80 uppercase tracking-wide"><Circle className="w-2 h-2 fill-amber-500 text-amber-500" /> Waiting</span>;
      case 'new': return <span className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-100/80 uppercase tracking-wide"><Circle className="w-2 h-2 fill-rose-500 text-rose-500" /> New</span>;
      default: return null;
    }
  };

  return (
    <tr className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${highlight ? 'bg-indigo-50/20' : ''}`}>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold shadow-sm ring-1 ring-slate-200/60">
            {user.init}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">{user.name}</div>
            <div className="text-xs text-slate-500 mt-0.5">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          {assignee.isAi ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 bg-violet-50 px-2.5 py-1.5 rounded-md border border-violet-100/80 shadow-sm">
              <Bot className="w-3.5 h-3.5" />
              {assignee.name}
            </div>
          ) : assignee.name === 'Unassigned' ? (
            <div className="text-xs font-medium text-slate-400 bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-100">
              Unassigned
            </div>
          ) : (
            <div className="text-sm text-slate-700 font-medium flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-slate-200 text-[9px] flex items-center justify-center font-bold text-slate-500">
                {assignee.name.split(' ').map((n:string)=>n[0]).join('')}
              </div>
              {assignee.name}
            </div>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        {getStatusBadge(status)}
      </td>
      <td className="px-6 py-4 text-sm text-slate-500 font-semibold">
        {waitTime}
      </td>
      <td className="px-6 py-4">
        <div className="text-sm text-slate-600 truncate max-w-[280px] group-hover:text-slate-900 transition-colors">
          {lastMsg}
        </div>
      </td>
      <td className="px-6 py-4 text-right">
        <button className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all bg-white shadow-sm border border-slate-200">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
};
