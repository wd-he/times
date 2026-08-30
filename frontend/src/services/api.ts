import { history } from '@umijs/max';

export type Role = 'admin' | 'user';

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  user_id: number;
  name: string;
  kind: 'major' | 'sub';
  parent_id?: number;
}

export interface AdminCategory extends Category {
  user_display_name: string;
  user_username: string;
  event_count: number;
}

export interface EventItem {
  id: number;
  user_id: number;
  user_name?: string;
  major_category_id: number;
  major_category: string;
  sub_category_id?: number;
  sub_category?: string;
  description: string;
  started_at: string;
  completed_at: string;
  duration_seconds: number;
}

export interface StatisticPoint {
  date?: string;
  major_category: string;
  user_id?: number;
  user_name?: string;
  duration_seconds: number;
}

const tokenKey = 'times_token';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = 'request_failed', status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function getToken() {
  return localStorage.getItem(tokenKey) || '';
}

export function setToken(token: string) {
  localStorage.setItem(tokenKey, token);
}

export function clearToken() {
  localStorage.removeItem(tokenKey);
}

function requestHeaders(contentType?: string, source?: HeadersInit) {
  const headers = new Headers(source);
  if (contentType && !headers.has('Content-Type')) headers.set('Content-Type', contentType);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

function redirectAfterAuthFailure(status: number) {
  if (status === 401) {
    clearToken();
    history.replace('/login');
  } else if (status === 403) {
    history.replace(localStorage.getItem('times_role') === 'admin' ? '/admin/users' : '/events');
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = requestHeaders('application/json', options.headers);
  const response = await fetch(`/api${path}`, { ...options, headers });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    redirectAfterAuthFailure(response.status);
    throw new ApiError(payload.message || '请求失败', payload.code, response.status);
  }
  return payload as T;
}

async function download(path: string): Promise<Blob> {
  const response = await fetch(`/api${path}`, { headers: requestHeaders() });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    redirectAfterAuthFailure(response.status);
    throw new ApiError(payload.message || '下载失败', payload.code, response.status);
  }
  return response.blob();
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body)
});

export const api = {
  login: (token: string) => request<{ user: User }>('/auth/login', json('POST', { token })),
  me: () => request<{ user: User }>('/auth/me'),
  resetOwnToken: (token_suffix?: string) => request<{ token: string }>('/auth/token/reset', json('POST', { token_suffix })),
  users: () => request<{ users: User[] }>('/users'),
  createUser: (body: { username: string; display_name: string }) => request<{ user: User; token: string }>('/users', json('POST', body)),
  updateUser: (id: number, body: { display_name?: string; enabled?: boolean }) => request<{ ok: boolean }>(`/users/${id}`, json('PATCH', body)),
  resetUserToken: (id: number, token_suffix?: string) => request<{ token: string }>(`/users/${id}/token/reset`, json('POST', { token_suffix })),
  categories: () => request<{ categories: Category[] }>('/categories'),
  createCategory: (body: { name: string; kind: 'major' | 'sub'; parent_id?: number }) => request<{ category?: Category; id?: number }>('/categories', json('POST', body)),
  adminCategories: () => request<{ categories: AdminCategory[] }>('/admin/categories'),
  deleteAdminCategory: (id: number) => request<void>(`/admin/categories/${id}`, { method: 'DELETE' }),
  clearUnusedCategories: () => request<{ deleted: number }>('/admin/categories/clear-unused', { method: 'POST' }),
  events: (params: Record<string, string | number> = {}) => request<{ events: EventItem[] }>(`/events?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`),
  exportEvents: (params: Record<string, string | number> = {}) => download(`/events/export?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`),
  importEvents: (file: Blob) => request<{ imported: number }>('/events/import', { method: 'POST', headers: requestHeaders('text/csv; charset=utf-8'), body: file }),
  createEvent: (body: unknown) => request<{ event: EventItem }>('/events', json('POST', body)),
  updateEvent: (id: number, body: unknown) => request<{ event: EventItem }>(`/events/${id}`, json('PATCH', body)),
  deleteEvent: (id: number) => request<void>(`/events/${id}`, { method: 'DELETE' }),
  dailyStatistics: (params: Record<string, string | number>) => request<{ points: StatisticPoint[] }>(`/statistics/daily-by-category?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`),
  categoryStatistics: (params: Record<string, string | number>) => request<{ points: StatisticPoint[] }>(`/statistics/by-category?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`),
  adminStatistics: (params: Record<string, string | number>) => request<{ points: StatisticPoint[] }>(`/admin/statistics/daily-by-user-category?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`)
};

export function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} 分钟`;
  return `${hours} 小时 ${minutes} 分钟`;
}
