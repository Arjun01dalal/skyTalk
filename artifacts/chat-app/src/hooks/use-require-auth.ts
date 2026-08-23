import { useGetMe, useRefreshToken, getGetMeQueryKey } from "@workspace/api-client-react";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../stores/auth";
import { useLocation } from "wouter";
import { QueryClient, QueryCache } from "@tanstack/react-query";

export function useRequireAuth() {
  const [, setLocation] = useLocation();
  const { data: user, error, isPending } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } });
  const refresh = useRefreshToken();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const accessToken = useAuthStore((s) => s.accessToken);
  const attemptedRefresh = useRef(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isPending) return;

    if (user) {
      setIsReady(true);
      return;
    }

    if (error && !attemptedRefresh.current) {
      attemptedRefresh.current = true;
      refresh.mutate(undefined, {
        onSuccess: (res) => {
          setAccessToken(res.accessToken);
          setIsReady(true);
        },
        onError: () => {
          setAccessToken(null);
          setLocation("/login");
        }
      });
    } else if (error && attemptedRefresh.current) {
      setAccessToken(null);
      setLocation("/login");
    }
  }, [user, error, isPending, refresh, setAccessToken, setLocation]);

  return { user, isReady };
}

// Global query error handling for 401s
export const createQueryClient = (setLocation: (path: string) => void) => new QueryClient({
  queryCache: new QueryCache({
    onError: (error: any) => {
      if (error?.status === 401) {
         // Handle fatal 401s by relying on the user to re-auth.
      }
    }
  })
});
