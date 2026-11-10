/** Open Menta from anywhere (sidebar card, buttons, shortcuts) without prop drilling. */
export const MENTA_OPEN_EVENT = "menta:open";

export interface MentaOpenDetail {
  /** Optional question to ask immediately. */
  prompt?: string;
}

export function openMenta(detail: MentaOpenDetail = {}) {
  window.dispatchEvent(new CustomEvent<MentaOpenDetail>(MENTA_OPEN_EVENT, { detail }));
}
