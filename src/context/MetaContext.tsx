import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { AIAgent, User } from '@/types';

interface MetaContextValue {
  users: User[];
  agents: AIAgent[];
  userName: (id?: string) => string;
  agentById: (id?: string) => AIAgent | undefined;
  actionLabels: Record<string, string>;
  setActionLabels: (labels: Record<string, string>) => void;
}

const MetaContext = createContext<MetaContextValue | undefined>(undefined);

export function MetaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [actionLabels, setActionLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) {
      setUsers([]);
      setAgents([]);
      return;
    }
    void api.meta().then(({ users: u, agents: a }) => {
      setUsers(u);
      setAgents(a.map((agent) => ({
        ...agent,
        roleCode: (agent as AIAgent & { roleCode?: string }).roleCode ?? 'brand_ai',
      })));
    }).catch(() => {});
  }, [user]);

  const value = useMemo<MetaContextValue>(() => ({
    users,
    agents,
    actionLabels,
    setActionLabels,
    userName: (id?: string) => {
      if (!id) return '未知使用者';
      return users.find((u) => u.id === id)?.displayName ?? '未知使用者';
    },
    agentById: (id?: string) => agents.find((a) => a.id === id),
  }), [users, agents, actionLabels]);

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export function useMeta(): MetaContextValue {
  const ctx = useContext(MetaContext);
  if (!ctx) throw new Error('useMeta must be used within MetaProvider');
  return ctx;
}
