import { useEffect, useRef, type ReactNode } from 'react';

/** Content remains visible during SSR and when reduced motion is preferred. */
export function ScrollReveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.08 }
    );
    root
      .querySelectorAll('[data-reveal]')
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  return <div ref={ref}>{children}</div>;
}
