import { useEffect } from 'react';

import { scheduleThirdParty } from '@/lib/schedule-third-party';

// GA4 stays off the first paint. The tag still loads for engaged visits and
// after idle; it is not required in the initial HTML for measurement.
export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  useEffect(() => {
    if (!measurementId) return;
    return scheduleThirdParty(() => {
      if (document.getElementById('ga-loader')) return;
      const loader = document.createElement('script');
      loader.id = 'ga-loader';
      loader.async = true;
      loader.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      document.head.appendChild(loader);
      const init = document.createElement('script');
      init.id = 'ga-init';
      init.text = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(measurementId)});`;
      document.head.appendChild(init);
    });
  }, [measurementId]);

  return null;
}
