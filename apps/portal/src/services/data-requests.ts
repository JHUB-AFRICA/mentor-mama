import { request } from "./api";

/** Formal data requests (concept note section 13): correct, show or delete what is held about a person. */

export type DataRequestType = "correction" | "access" | "erasure";
export type DataRequestArea = "profile" | "placement" | "session" | "feedback" | "other";
export type DataRequestStatus = "received" | "in_review" | "completed" | "declined" | "withdrawn";

export interface DataRequest {
  id: string;
  request_type: DataRequestType;
  request_type_label: string;
  subject_area: DataRequestArea;
  subject_area_label: string;
  description: string;
  requested_change: string;
  reason: string;
  status: DataRequestStatus;
  status_label: string;
  response_note: string;
  routed_to: "programme" | "platform";
  enquiry_reference: string;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  closed_at: string | null;
  due_at: string;
  is_open: boolean;
  age_days: number;
  days_left: number | null;
  overdue: boolean;
  days_overdue: number;
}

export interface DataRequestRequester {
  id: string;
  name: string;
  email: string;
  role: string;
  role_label: string;
  status: string;
  institution_id: string | null;
  facility_id: string | null;
}

export interface AdminDataRequest extends DataRequest {
  requester: DataRequestRequester;
}

export interface DataRequestInput {
  request_type: DataRequestType;
  subject_area: DataRequestArea;
  description: string;
  requested_change?: string;
  reason?: string;
}

export interface DataRequestQueue {
  results: AdminDataRequest[];
  counts: { open: number; in_review: number; overdue: number };
  pagination: { page: number; page_size: number; total_count: number; total_pages: number; has_next: boolean; has_previous: boolean };
}

export interface DataRequestQuery {
  status?: string;
  request_type?: string;
  search?: string;
  overdue?: boolean;
  page?: number;
}

const base = "/api/v1/privacy/requests";

export async function getMyDataRequests(): Promise<{ requests: DataRequest[]; responseDays: number }> {
  const response = await request<{ data: DataRequest[]; meta?: { response_days?: number } }>(base);
  return { requests: response.data, responseDays: response.meta?.response_days ?? 30 };
}

export async function createDataRequest(input: DataRequestInput): Promise<DataRequest> {
  const response = await request<{ data: DataRequest }>(base, { method: "POST", body: JSON.stringify(input) });
  return response.data;
}

export async function withdrawDataRequest(id: string): Promise<DataRequest> {
  const response = await request<{ data: DataRequest }>(`${base}/${id}/withdraw`, { method: "POST", body: "{}" });
  return response.data;
}

export async function getDataRequestQueue(query: DataRequestQuery = {}): Promise<DataRequestQueue> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.request_type) params.set("request_type", query.request_type);
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.overdue) params.set("overdue", "true");
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const suffix = params.toString();
  const response = await request<{ data: DataRequestQueue }>(`${base}/admin${suffix ? `?${suffix}` : ""}`);
  return response.data;
}

export async function actOnDataRequest(id: string, action: "review" | "complete" | "decline", note = ""): Promise<AdminDataRequest> {
  const response = await request<{ data: AdminDataRequest }>(`${base}/admin/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
  return response.data;
}

export const typeOptions: Array<{ value: DataRequestType; label: string; hint: string }> = [
  { value: "correction", label: "Correct my information", hint: "Something we hold about you is wrong or out of date." },
  { value: "access", label: "Show me what you hold about me", hint: "You would like to see the information held about you." },
  { value: "erasure", label: "Delete or deactivate my account", hint: "You want your account closed. Some records may have to be kept; we will explain." },
];

export const areaOptions: Array<{ value: DataRequestArea; label: string }> = [
  { value: "profile", label: "My profile details" },
  { value: "placement", label: "My placement details" },
  { value: "session", label: "A session record" },
  { value: "feedback", label: "Feedback I gave" },
  { value: "other", label: "Something else" },
];
