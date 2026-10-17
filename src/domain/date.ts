const shanghaiDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function dayKey(date = new Date()): string {
  const parts = shanghaiDate.formatToParts(date);
  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function dayOffset(start: string, current: string): number {
  return Math.floor(
    (Date.parse(`${current}T00:00:00+08:00`) -
      Date.parse(`${start}T00:00:00+08:00`)) /
      86400000,
  );
}
export function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
  }).format(new Date(value.length === 10 ? `${value}T00:00:00+08:00` : value));
}
