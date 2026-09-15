export function dateKey(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export function nextDay(date: string): string {
  return offsetDay(date, 1);
}
export function offsetDay(date: string, offset: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return dateKey(d);
}
export function prettyDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}
