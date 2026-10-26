import { CreateVideo } from '@/blocks/create-video';
import { AgentHeaderProvider } from '@/components/agent/agent-header-context';

export function Hero() {
  return (
    <section className="py-10 sm:py-16">
      <AgentHeaderProvider>
        <CreateVideo />
      </AgentHeaderProvider>
    </section>
  );
}
