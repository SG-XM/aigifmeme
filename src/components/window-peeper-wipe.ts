/** Map a pointer's viewport X onto the stage, always left-to-right. */
export function wipePercent(clientX: number, left: number, width: number) {
  if (!(width > 0)) return 0;
  return Math.min(100, Math.max(0, ((clientX - left) / width) * 100));
}
