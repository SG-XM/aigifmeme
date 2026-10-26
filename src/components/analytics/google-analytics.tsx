import { useEffect } from 'react';

import { sanitizeGoogleAnalyticsId } from '@/lib/google-analytics-id';
import { scheduleThirdParty } from '@/lib/schedule-third-party';

// GA4 stays off the first paint. The tag still loads for engaged visits and
// after idle; it is not required in the initial HTML for measurement.
export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const id = sanitizeGoogleAnalyticsId(measurementId);
  useEffect(() => {
    if (!id) return;
    return scheduleThirdParty(() => {
      if (document.getElementById('ga-loader')) return;
      const loader = document.createElement('script');
      loader.id = 'ga-loader';
      loader.async = true;
      loader.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      document.head.appendChild(loader);
      const init = document.createElement('script');
      init.id = 'ga-init';
      init.text = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(id)});`;
      document.head.appendChild(init);
    });
  }, [id]);

  return null;
}
