import { API_BASE_URL, BUBBLE_TOKEN } from '../config/api';

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
  worker_email?: string; // email do worker (link com Supabase users.email)
}

export interface FetchTodayWOOptions {
  workerEmail: string;
}

interface BubbleListResponse<T> {
  response: {
    cursor: number;
    results: T[];
  };
}

export async function fetchTodayWO(opts: FetchTodayWOOptions): Promise<WorkOrderRow[]> {
  const { workerEmail } = opts;

  // Busca WOs onde worker_email = email do worker logado no Supabase Auth.
  // Filtros:
  //   worker_email = email do worker (identificador único entre Supabase e Bubble)
  //   status <> COMPLETED
  //   deletado = false
  //   liberado_para_pintor = true
  //   esconder_complain_calendario = false
  //   ordenação por data (ascendente — mais antigas primeiro)
  const constraints = JSON.stringify([
    { key: 'worker_email', constraint_type: 'equals', value: workerEmail },
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
      Authorization: `Bearer ${BUBBLE_TOKEN}`,
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
    worker_email: r.worker_email as string | undefined,
  }));
}
