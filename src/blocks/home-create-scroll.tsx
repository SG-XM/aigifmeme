import { useEffect } from 'react';

import { watchHomeCreateScroll } from '@/lib/home-create-scroll';

/** After the homepage lays out, scroll the photo-picker card into view. */
export function HomeCreateScroll() {
  useEffect(() => watchHomeCreateScroll(), []);
  return null;
}
