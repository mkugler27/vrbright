import { API_BASE_URL } from '../config/api';

const API_BASE = API_BASE_URL;

interface LoginResponse {
  status?: string;
  success?: boolean;
  user?: {
    id_bubble: string;
    nome: string;
    profile_picture?: string;
  };
  token?: string;
  message?: string;
  response?: {
    token?: string;
    user_id?: string;
    expires?: number;
  };
}

export interface UserProfile {
  id_bubble: string;
  nome: string;
  email?: string;
  profile_picture?: string;
}

export async function login(email: string, senha: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/wf/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, senha }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }

  return response.json() as Promise<LoginResponse>;
}

export async function fetchUserProfile(idBubble: string, token: string): Promise<UserProfile> {
  const response = await fetch(`${API_BASE}/obj/user/${idBubble}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch user failed: ${response.status}`);
  }

  const data = await response.json() as { response: Record<string, unknown> };
  const u = data.response;

  return {
    id_bubble: (u._id as string) || idBubble,
    nome: (u.Nome as string) || (u.nome as string) || '',
    email: (u['Email'] as string) || undefined,
    profile_picture: (u['profile_picture'] as string) || (u['profile_picture_url'] as string) || undefined,
  };
}