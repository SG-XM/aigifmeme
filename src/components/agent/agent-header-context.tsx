import { createContext, useContext, useState } from 'react';

export interface AgentHeaderContent {
  title?: string;
  onEditClick?: () => void;
  /** Page-supplied buttons, rendered left of the gallery toggle. */
  actions?: React.ReactNode;
}

interface AgentHeaderState {
  content: AgentHeaderContent;
  setContent: (c: AgentHeaderContent) => void;
}

const Ctx = createContext<AgentHeaderState | null>(null);

export function AgentHeaderProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [content, setContent] = useState<AgentHeaderContent>({});
  return (
    <Ctx.Provider value={{ content, setContent }}>{children}</Ctx.Provider>
  );
}

export function useAgentHeader(): AgentHeaderState {
  return useContext(Ctx) ?? { content: {}, setContent: () => {} };
}
