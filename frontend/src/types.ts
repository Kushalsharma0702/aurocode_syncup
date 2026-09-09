export type Role = "admin" | "client";

export type ProjectStatus = "Draft" | "Sent" | "In Review" | "Approved" | "Rejected" | "Completed";
export type TaskStatus = "Pending" | "In Progress" | "Blocked" | "Completed";
export type TaskPriority = "Low" | "Medium" | "High" | "Critical";

export const PROJECT_STATUSES: ProjectStatus[] = ["Draft", "Sent", "In Review", "Approved", "Rejected", "Completed"];
export const TASK_STATUSES: TaskStatus[] = ["Pending", "In Progress", "Blocked", "Completed"];
export const TASK_PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Critical"];

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  client_name: string;
  client_id: number | null;
  description: string;
  objective: string;
  scope: string;
  deliverables: string;
  timeline: string;
  budget: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  task_count: number;
  completed_task_count: number;
  progress: number;
}

export interface Task {
  id: number;
  project_id: number;
  project_name: string;
  title: string;
  description: string;
  assigned_to: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  project_id: number;
  project_name: string;
  user: User;
  message: string;
  created_at: string;
}

export interface Attachment {
  id: number;
  project_id: number;
  original_name: string;
  content_type: string;
  size: number;
  created_at: string;
}

export interface Activity {
  id: number;
  project_id: number | null;
  project_name: string | null;
  user: User | null;
  action: string;
  detail: string;
  created_at: string;
}

export interface SessionInfo {
  id: string;
  user_agent: string;
  ip_address: string;
  created_at: string;
  last_seen_at: string;
  is_current: boolean;
}

export interface Notification {
  id: number;
  project_id: number | null;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface ChatMessage {
  id: number;
  thread_user_id: number;
  sender: User;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface ChatThread {
  client: User;
  last_message: ChatMessage | null;
  unread: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReportLink {
  id: number;
  url: string;
  expires_at: string;
  created_at: string;
}

export interface ReportLinkSummary {
  id: number;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
}

export interface PublicReportActivity {
  action: string;
  detail: string;
  created_at: string;
}

export interface PublicReport {
  project_name: string;
  client_name: string;
  description: string;
  status: string;
  timeline: string;
  budget: string;
  task_count: number;
  completed_task_count: number;
  progress: number;
  activities: PublicReportActivity[];
  generated_at: string;
}

export interface DashboardStats {
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  pending_tasks: number;
  recent_activity: Activity[];
}
