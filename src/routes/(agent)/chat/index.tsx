import { createFileRoute } from '@tanstack/react-router';

import { PromptLauncher } from '@/components/agent/prompt-launcher';

export const Route = createFileRoute('/(agent)/chat/')({
  component: AgentHomePage,
});

function AgentHomePage() {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-10">
        <PromptLauncher />
      </div>
    </div>
  );
}
