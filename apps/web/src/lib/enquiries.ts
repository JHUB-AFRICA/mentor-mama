/** Sends the website forms (contact, pilot access, support) to the API. */

export type EnquiryKind = "contact" | "pilot" | "support";

export type EnquiryInput = {
  kind: EnquiryKind;
  topic: string;
  name: string;
  email: string;
  phone?: string;
  organisation?: string;
  subject?: string;
  message: string;
  consent: boolean;
  details?: Record<string, string | number | null>;
  source_page: string;
  website: string; // honeypot: people leave it empty
  started_at: number; // when the form was opened (ms), so instant bot submissions can be ignored
};

const apiBase = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/+$/, "");

export class EnquiryError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

/** Returns the reference to quote ("CON-2026-0042"). Throws an EnquiryError whose message can be shown as is. */
export async function sendEnquiry(input: EnquiryInput): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/v1/public/enquiries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new EnquiryError("We couldn’t reach MentorMAMA. Check your connection and try again; what you typed is still here.");
  }
  if (response.ok) {
    const body = (await response.json().catch(() => null)) as { data?: { reference?: string } } | null;
    return body?.data?.reference ?? "";
  }
  const body = (await response.json().catch(() => null)) as { error?: { message?: string }; [field: string]: unknown } | null;
  if (response.status === 429 && body?.error?.message) throw new EnquiryError(body.error.message);
  if (response.status === 400 && body) {
    // Field errors look like { "email": ["Enter a valid email address."] }.
    for (const [field, value] of Object.entries(body)) {
      if (Array.isArray(value) && typeof value[0] === "string") throw new EnquiryError(value[0], field);
    }
    if (body.error?.message) throw new EnquiryError(body.error.message);
  }
  throw new EnquiryError("Something went wrong on our side. Please try again in a few minutes; what you typed is still here.");
}
