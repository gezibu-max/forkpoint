const dateNow = Date.now.bind(Date);
const hrtime = process.hrtime.bigint.bind(process.hrtime);
const performanceNow = performance.now.bind(performance);

export function realNow(): number {
  return dateNow();
}

export function realPerformanceNow(): number {
  return performanceNow();
}

export function monotonicNow(): bigint {
  return hrtime();
}

export function elapsedMs(startedAt: bigint): number {
  return Number(hrtime() - startedAt) / 1e6;
}
