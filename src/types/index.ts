export type UserType = "seller" | "buyer" | "agent" | "org_admin" | "platform_admin" | "system";

export type ApiResponse<T> =
  | { data: T; error: null }
  | { data: null; error: string };

export function ok<T>(data: T): ApiResponse<T> {
  return { data, error: null };
}

export function err(message: string): ApiResponse<never> {
  return { data: null, error: message };
}
