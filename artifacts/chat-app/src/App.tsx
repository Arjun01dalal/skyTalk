import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { createQueryClient, useRequireAuth } from './hooks/use-require-auth';
import { useSso } from './hooks/use-sso';

import Login from './pages/login';
import Register from './pages/register';
import ChatWorkspace from './pages/chat';
import Calls from './pages/calls';
import AdminDashboard from './pages/admin';
import AdminMonitor from './pages/admin-monitor';
import UserDirectory from './pages/user-directory';
import AiSupport from './pages/ai-support';
import AdminTemplates from './pages/admin-templates';
import Reports from './pages/reports';
import HistoryPage from './pages/history';
import SsoTest from './pages/sso-test';
import ChangePassword from './pages/change-password';
import SlaPage from './pages/sla';

import { AppShell } from './components/AppShell';
import { SocketProvider } from './contexts/SocketContext';
import { CallProvider } from './contexts/CallContext';
import { CallOverlay } from './components/CallOverlay';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

// Wrapper for auth-protected routes
function ProtectedRoute({ component: Component, adminOnly = false, staffOnly = false, adminHome = false }: { component: any, adminOnly?: boolean, staffOnly?: boolean, adminHome?: boolean }) {
  const { user, isReady } = useRequireAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Staff created with the default password must set a new one before
    // using any panel (end-users are exempt).
    if (isReady && user && user.mustChangePassword && user.role !== 'user') {
      setLocation('/change-password');
      return;
    }
    if (isReady && user && adminOnly && user.role !== 'admin') {
      setLocation('/');
    }
    if (isReady && user && staffOnly && user.role === 'user') {
      setLocation('/');
    }
    // Send admins to their dashboard on initial landing only — allow explicit
    // navigation back to Messages ("/") afterwards.
    if (isReady && user && adminHome && user.role === 'admin' && !sessionStorage.getItem('adminHomeRedirected')) {
      sessionStorage.setItem('adminHomeRedirected', '1');
      setLocation('/admin');
    }
  }, [isReady, user, adminOnly, adminHome, setLocation]);

  if (!isReady || !user) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user.mustChangePassword && user.role !== 'user') {
    return null; // redirecting to /change-password
  }

  if ((adminOnly && user.role !== 'admin') || (staffOnly && user.role === 'user')) {
    return null; // redirecting
  }

  return (
    <SocketProvider>
      <CallProvider>
        <AppShell user={user}>
          <Component />
        </AppShell>
        <CallOverlay />
      </CallProvider>
    </SocketProvider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/sso-test" component={SsoTest} />
      <Route path="/change-password" component={ChangePassword} />
      
      <Route path="/">
        {() => <ProtectedRoute component={ChatWorkspace} adminHome />}
      </Route>
      <Route path="/calls">
        {() => <ProtectedRoute component={Calls} />}
      </Route>
      <Route path="/admin">
        {() => <ProtectedRoute component={AdminDashboard} adminOnly />}
      </Route>
      <Route path="/directory">
        {() => <ProtectedRoute component={UserDirectory} adminOnly />}
      </Route>
      <Route path="/sla">
        {() => <ProtectedRoute component={SlaPage} adminOnly />}
      </Route>
      <Route path="/ai-support">
        {() => <ProtectedRoute component={AiSupport} adminOnly />}
      </Route>
      <Route path="/monitor">
        {() => <ProtectedRoute component={AdminMonitor} adminOnly />}
      </Route>
      <Route path="/templates">
        {() => <ProtectedRoute component={AdminTemplates} adminOnly />}
      </Route>
      <Route path="/history">
        {() => <ProtectedRoute component={HistoryPage} staffOnly />}
      </Route>
      <Route path="/reports">
        {() => <ProtectedRoute component={Reports} staffOnly />}
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [, setLocation] = useLocation();
  const [queryClient] = useState(() => createQueryClient(setLocation));
  const { ssoStatus, ssoError } = useSso();

  if (ssoStatus === 'pending') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (ssoStatus === 'error') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background p-8">
        <div className="max-w-sm text-center space-y-2">
          <h1 className="text-lg font-semibold text-foreground">Could not sign you in</h1>
          <p className="text-sm text-muted-foreground">{ssoError || 'Please try launching the chat again.'}</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
