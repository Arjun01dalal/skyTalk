import re

with open('artifacts/chat-app/src/pages/chat.tsx', 'r') as f:
    content = f.read()

# ChatWorkspace Container
content = content.replace(
    'className="flex h-full w-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-violet-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950/20 relative overflow-hidden"',
    'className="flex h-[100dvh] w-full bg-background relative overflow-hidden"'
)

# Sidebar List
content = content.replace(
    '"w-full md:w-80 lg:w-96 flex flex-col border-r border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-950/60 backdrop-blur-xl shadow-sm z-10 transition-all"',
    '"w-full md:w-80 lg:w-96 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl z-20 transition-all"'
)

# Sidebar Header
content = content.replace(
    'className="p-4 border-b border-slate-200/60 dark:border-slate-800/60 h-16 flex items-center gap-3 bg-gradient-to-b from-white to-slate-50/50 dark:from-slate-950 dark:to-slate-900/50 sticky top-0"',
    'className="p-4 border-b border-sidebar-border h-16 flex items-center gap-3 bg-sidebar sticky top-0"'
)

# Sidebar Text
content = content.replace(
    'className="font-semibold text-slate-900 dark:text-slate-100 tracking-tight flex-1"',
    'className="font-bold text-sidebar-foreground tracking-tight flex-1"'
)

# Sidebar New Chat Border
content = content.replace(
    'className="p-4 border-b border-slate-200/60 dark:border-slate-800/60 bg-muted/20 space-y-2"',
    'className="p-4 border-b border-sidebar-border bg-sidebar-accent/50 space-y-2"'
)

# Search Input
content = content.replace(
    'className="pl-9 h-9 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-400"',
    'className="pl-9 h-9 bg-sidebar border-sidebar-border text-sidebar-foreground focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary"'
)
content = content.replace(
    'className="p-3 border-b border-slate-200/60 dark:border-slate-800/60"',
    'className="p-3 border-b border-sidebar-border bg-sidebar"'
)

# Directory text
content = content.replace(
    'className="px-2 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"',
    'className="px-2 py-1.5 text-[11px] font-bold text-sidebar-foreground/50 uppercase tracking-wider"'
)

# Contact Item Hover
content = content.replace(
    'className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100/80 dark:hover:bg-slate-800/50 transition-colors text-left"',
    'className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-sidebar-accent transition-colors text-left"'
)

# Avatar
content = content.replace(
    'className="h-10 w-10 border-2 border-white dark:border-slate-800 shadow-sm"',
    'className="h-10 w-10 border border-border shadow-sm"'
)
content = content.replace(
    'className="bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 text-sm font-medium"',
    'className="bg-sidebar-accent text-sidebar-foreground text-sm font-bold"'
)

# Active/Typing/Status texts
content = content.replace('text-slate-900 dark:text-slate-100', 'text-foreground')
content = content.replace('text-slate-700 dark:text-slate-300', 'text-foreground/80')
content = content.replace('text-slate-500', 'text-muted-foreground')
content = content.replace('text-slate-400', 'text-muted-foreground/70')

# Convo Active class
content = content.replace(
    'isActive\n                              ? "bg-gradient-to-r from-blue-50 via-blue-50/50 to-transparent dark:from-blue-950/40 dark:via-blue-950/20 border border-blue-200/50 dark:border-blue-900/50 shadow-sm"\n                              : "hover:bg-slate-100/80 dark:hover:bg-slate-800/50 hover:shadow-sm border border-transparent"',
    'isActive\n                              ? "bg-sidebar-accent border-sidebar-border shadow-sm"\n                              : "hover:bg-sidebar-accent/50 border-transparent"'
)

content = content.replace(
    'className="h-9 w-9 border-2 border-white dark:border-slate-800 shadow-sm"',
    'className="h-9 w-9 border border-border shadow-sm"'
)

content = content.replace(
    'className={cn("text-xs font-medium", isActive ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200")}',
    'className={cn("text-xs font-bold", isActive ? "bg-primary text-primary-foreground" : "bg-sidebar-accent text-sidebar-foreground")}'
)

content = content.replace(
    'isActive\n                                            ? "bg-gradient-to-r from-blue-50 via-blue-50/50 to-transparent dark:from-blue-950/40 dark:via-blue-950/20 border border-blue-200/50 dark:border-blue-900/50 shadow-sm"\n                                            : "hover:bg-slate-100/80 dark:hover:bg-slate-800/50 border border-transparent"',
    'isActive\n                                            ? "bg-sidebar-accent border-sidebar-border shadow-sm"\n                                            : "hover:bg-sidebar-accent/50 border-transparent"'
)

content = content.replace(
    'isActive ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"',
    'isActive ? "bg-primary text-primary-foreground" : "bg-sidebar-accent text-sidebar-foreground"'
)

content = content.replace(
    'bg-violet-100 text-violet-700 border-violet-200/50 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-900 hover:bg-violet-100',
    'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
)

content = content.replace(
    'bg-amber-100 text-amber-700 border-amber-200/50 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900 hover:bg-amber-100',
    'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20'
)

content = content.replace(
    'bg-blue-600 text-white border-0 hover:bg-blue-600 ml-auto',
    'bg-primary text-primary-foreground border-0 hover:bg-primary ml-auto shadow-sm'
)

# Live Monitor Headers
content = content.replace(
    'Live Monitor — Callers',
    'Monitor — Callers'
)

content = content.replace(
    'bg-slate-100/80 dark:bg-slate-800/50',
    'bg-sidebar-accent'
)

content = content.replace(
    'hover:bg-slate-100/80 dark:hover:bg-slate-800/50',
    'hover:bg-sidebar-accent/50'
)

content = content.replace(
    'border-l border-slate-200/80 dark:border-slate-800',
    'border-l border-sidebar-border'
)

content = content.replace(
    'className="flex-1 flex flex-col bg-white/50 dark:bg-slate-950/30 min-w-0 min-h-0 overflow-hidden absolute inset-0 md:static transition-transform"',
    'className="flex-1 flex flex-col bg-background min-w-0 min-h-0 overflow-hidden absolute inset-0 md:static transition-transform z-10"'
)

content = content.replace(
    'className="w-24 h-24 bg-gradient-to-br from-violet-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-lg shadow-violet-500/30"',
    'className="w-24 h-24 bg-primary rounded-3xl flex items-center justify-center shadow-lg shadow-primary/30"'
)

content = content.replace(
    'className="w-24 h-24 bg-gradient-to-br from-blue-600 to-blue-500 rounded-3xl flex items-center justify-center shadow-lg shadow-blue-600/30"',
    'className="w-24 h-24 bg-primary rounded-3xl flex items-center justify-center shadow-lg shadow-primary/30"'
)

with open('artifacts/chat-app/src/pages/chat.tsx', 'w') as f:
    f.write(content)
