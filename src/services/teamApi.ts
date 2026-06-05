import { API_BASE_URL } from '../config/api';

const API_BASE = API_BASE_URL;

export interface TeamMember {
  _id: string;
  Nome: string;
  nickname?: string;
  email?: string;
  telefone?: string;
  profile_picture?: string;
  tipo_user?: string;
}

interface UserListResponse {
  response: {
    cursor: number;
    results: Record<string, unknown>[];
  };
}

export async function fetchActiveTeam(token: string): Promise<TeamMember[]> {
  const constraints = JSON.stringify([
    { key: 'user_ativo_txt', constraint_type: 'equals', value: 'yes' },
  ]);
  const params = new URLSearchParams({ constraints });

  const response = await fetch(`${API_BASE}/obj/user?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch team failed: ${response.status}`);
  }

  const data = (await response.json()) as UserListResponse;

  return data.response.results.map((u) => {
    const auth = u.authentication as { email?: { email?: string } } | undefined;
    return {
      _id: u._id as string,
      Nome: (u.Nome as string) || (u.nickname as string) || '',
      nickname: (u.nickname as string) || undefined,
      email: auth?.email?.email || undefined,
      telefone: (u.telefone as string) || (u.whats_user as string) || undefined,
      profile_picture: (u.profile_picture as string) || undefined,
      tipo_user: (u.tipo_user as string) || undefined,
    };
  });
}