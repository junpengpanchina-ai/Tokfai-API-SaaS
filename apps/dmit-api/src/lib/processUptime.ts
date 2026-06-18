const processStartedAt = Date.now();

export function getUptimeSeconds(): number {
  return Math.floor((Date.now() - processStartedAt) / 1000);
}
