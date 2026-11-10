/** "Good morning, Faith" — time-aware, uses the first word of the person's name. */
export function greetingFor(name: string | undefined, now: Date = new Date()): string {
  const hour = now.getHours();
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}
