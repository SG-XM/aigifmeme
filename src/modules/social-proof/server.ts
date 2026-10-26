import { createServerFn } from '@tanstack/react-start';

/** Live social-proof count for the homepage. Null when the database is down. */
export const getGeneratedVideoCountFn = createServerFn().handler(async () => {
  try {
    const { getGeneratedVideoCount } = await import('./service');
    return await getGeneratedVideoCount();
  } catch (error) {
    console.error('generated video count unavailable', error);
    return null;
  }
});
