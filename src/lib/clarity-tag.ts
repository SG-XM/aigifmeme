/**
 * Installs the Clarity tag once. A second run must not insert another tag —
 * that double load is Clarity CL001 (`q.unshift` of undefined).
 * The caller decides when to run this. The homepage schedules it with the
 * same idle/interact helper as GA4 so the tag does not race first paint.
 * `clarityProjectId` in the root route still rejects non-alphanumeric ids.
 */
export function clarityInitScript(projectId: string) {
  return `(function(c,l,a,r,i,t,y){
            if((typeof c[a]==="function"&&c[a].q)||l.querySelector("script[src*='clarity.ms/tag/']"))return;
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", ${JSON.stringify(projectId)});`;
}
