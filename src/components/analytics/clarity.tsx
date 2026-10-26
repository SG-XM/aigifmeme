import { useEffect } from 'react';

import { clarityInitScript } from '@/lib/clarity-tag';
import { scheduleThirdParty } from '@/lib/schedule-third-party';

// Same schedule as GA4: after load, on idle, or on the first tap/keypress.
// The tag is not in the document head, so it does not run during HTML parse.
export function Clarity({ projectId }: { projectId: string }) {
  useEffect(() => {
    if (!projectId) return;
    return scheduleThirdParty(() => {
      if (document.getElementById('clarity-init')) return;
      const script = document.createElement('script');
      script.id = 'clarity-init';
      script.text = clarityInitScript(projectId);
      document.head.appendChild(script);
    });
  }, [projectId]);

  return null;
}
