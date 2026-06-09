import { API_BASE_URL } from '../config/api';

const API_BASE = API_BASE_URL;

export interface WorkOrderRow {
  _id: string;
  codigo_id?: string | number;
  tipo_JOB?: string;
  apt?: string;
  data?: string;
  data_inicio?: string;
  status?: string;
  prioridade?: boolean | string;
  liberado_para_pintor?: boolean;
  deletado?: boolean;
  esconder_complain_calendario?: boolean;
  qual_condo?: string; // property bubble _id
  qual_pintor?: string; // user bubble _id
  qual_condo_txt?: string;
  qual_condo_txt_nick?: string;
  qual_pintor_txt?: string;
  qual_pintor_nick_txt?: string;
}

export interface FetchTodayWOOptions {
  userBubbleId: string;
  token: string;
}

interface BubbleListResponse<T> {
  response: {
    cursor: number;
    results: T[];
  };
}

export async function fetchTodayWO(opts: FetchTodayWOOptions): Promise<WorkOrderRow[]> {
  const { userBubbleId, token } = opts;

  // Bubble "obj/workingorders" – show every WO assigned to this painter that
  // is NOT completed yet. We don't filter by date here: a worker should be
  // able to see any open job, regardless of when it's scheduled.
  //
  //   qual_pintor = Current User
  //   status <> COMPLETED
  //   liberado_para_pintor = true
  //   deletado = false
  //   esconder_complain_calendario = false
  //   sort by data ascending (earliest first)
  //
  // NOTE: in Bubble's schema the values for liberado_para_pintor / deletado /
  // esconder_complain_calendario are booleans (not "yes"/"no" strings), and
  // there is no `Type` field — "Type" in the UI is the Data Type's name, not
  // a per-record field.
  const constraints = JSON.stringify([
    { key: 'qual_pintor', constraint_type: 'equals', value: userBubbleId },
    { key: 'status', constraint_type: 'not equal', value: 'COMPLETED' },
    { key: 'liberado_para_pintor', constraint_type: 'equals', value: true },
    { key: 'deletado', constraint_type: 'equals', value: false },
    { key: 'esconder_complain_calendario', constraint_type: 'equals', value: false },
  ]);

  const params = new URLSearchParams({
    constraints,
    sort_field: 'data',
    descending: 'false',
    limit: '50',
  });

  const url = `${API_BASE}/obj/workingorders?${params.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Fetch WO failed: ${res.status}`);
  }

  const json = (await res.json()) as BubbleListResponse<Record<string, unknown>>;
  const raw = json.response.results;

  return raw.map((r) => ({
    _id: r._id as string,
    codigo_id: (r.codigo_id as string | number) ?? undefined,
    tipo_JOB: r.tipo_JOB as string | undefined,
    apt: r.apt as string | undefined,
    data: r.data as string | undefined,
    data_inicio: r.data_inicio as string | undefined,
    status: r.status as string | undefined,
    prioridade: r.prioridade as string | undefined,
    liberado_para_pintor: r.liberado_para_pintor as boolean | undefined,
    deletado: r.deletado as boolean | undefined,
    esconder_complain_calendario: r.esconder_complain_calendario as boolean | undefined,
    qual_condo: r.qual_condo as string | undefined,
    qual_pintor: r.qual_pintor as string | undefined,
    qual_condo_txt: r.qual_condo_txt as string | undefined,
    qual_condo_txt_nick: r.qual_condo_txt_nick as string | undefined,
    qual_pintor_txt: r.qual_pintor_txt as string | undefined,
    qual_pintor_nick_txt: r.qual_pintor_nick_txt as string | undefined,
  }));
}
