# CLAUDE_RULES.md

**Este é o arquivo de regras de referência do projeto.** Consultado ANTES de implementar qualquer coisa.

---

## 1. Header — Online/Offline Indicator

**Toda tela do app (incluindo login) deve exibir no header um indicador visual de conexão:**
- Verde brilhante quando online
- Vermelho (danger) quando offline
- Posição: canto superior direito do header, após elementos de branding
- Usar círculo pequeno (~10px) ou ícone de wifi com tooltip

---

## 2. Error Popup Global

**Todo erro lançado via `console.error` no app deve aparecer em um popup personalizado:**
- Cor de fundo: `--color-danger` (#EF4444) ou tonalidade suave do app
- Texto em branco
- Botão "Dismiss" para fechar
- Não bloqueia a interface (pode fechar e continuar)
- Implementar via um `ErrorContext` que intercepta `window.onerror` e `unhandledrejection`
- Toast ou modal simples, posicionado no topo da tela

---

## 2.5. SEMPRE usar Popover custom, NUNCA `<select>` nativo

**Proibido usar o elemento `<select>` do HTML em qualquer tela do app.**

Razão: dropdown nativo tem visual inconsistente entre iOS/Android, feio, e quebra o design Apple-like.

**Padrão**: usar o componente `TypeFilterPopover` (referência: `src/pages/TeamPage.tsx`) — ou criar um componente genérico `Popover` reutilizável se for usar em mais lugares.

Características esperadas:
- Botão que mostra label + ícone (chevron rotativo)
- Card flutuante com sombra, animação `slideDown`
- Lista de opções com check mark no selecionado
- Fecha ao clicar fora (clique fora do container ref)
- Bolinhas coloridas/ícones para indicar visualmente cada opção

Se aparecer mais de um filtro na app, extrair pra `src/components/ui/Popover.tsx` e reutilizar.

---

## 3. Tech Stack & Patterns

- **PWA offline-first**: toda escrita vai para IndexedDB ANTES de tentar syncar
- **Sync queue**: ações offline enfileiradas no IndexedDB, processadas FIFO com retry
- **Cores do tema**: disponíveis via CSS vars em `src/index.css` (`--color-primary`, `--color-danger`, etc.)
- **Tela sempre em inglês** — todo texto em inglês
- **Mobile-first**: layout responsivo, touch-friendly, portrait orientation

---

## 4. Fluxo de Dados (offline-first)

**TODA listagem/dados buscados da API deve:**
1. Carregar do cache IndexedDB **instantaneamente** ao abrir a tela
2. Tentar refresh da rede em **background** (sem loading spinner se já tem cache)
3. Salvar resultado novo no cache
4. Mostrar indicador discreto de "última sincronização" (ex: "5m ago", "Offline · 2h ago")
5. Se não tem cache e tá offline → empty state com mensagem amigável
6. Nunca bloquear a UI por falta de rede (degrada gracefully)

**Stores IndexedDB disponíveis** (em `src/services/db.ts`):
- `team` (com `team_last_sync` em `meta`)
- `workOrders`, `photos`, `syncQueue` (placeholders para uso futuro)
- `meta` (key-value genérico: `setMeta(key, value)`, `getMeta(key)`)

---

## 5. APIs Bubble

- **Base URL centralizado** em `src/config/api.ts` (`API_BASE_URL`)
- Ambiente controlado pela constante `VERSION` (default: `version-test`)
- Pra trocar pra prod: muda `VERSION` em `src/config/api.ts` ou seta `VITE_BUBBLE_API_URL` no env
- Main API: `${API_BASE_URL}` + Bearer token
- Photo upload: hardcoded em `src/config/api.ts` (`PHOTO_UPLOAD_URL` e `PHOTO_UPLOAD_TOKEN`)
- Worker auth: integrar com Bubble User object via workflow custom `/wf/login`

---

**Para mudar de test → live em 1 linha:**

```ts
// src/config/api.ts
const VERSION = 'version-live'; // ← antes era 'version-test'
```

---

## 6. Pastas e estrutura

```
src/
├── components/layout/   # AppShell, etc
├── components/ui/       # Button, StatusBadge, ErrorToast, etc
├── context/             # SyncContext, ErrorContext, AuthContext (future)
├── hooks/               # useOnlineStatus, useWorkOrders, useError
├── pages/               # LoginPage, WorkOrdersPage, WorkOrderDetailPage, etc
├── services/            # api.ts, db.ts, sync.ts, imageCompressor.ts
└── types/               # WorkOrder, Photo, SyncQueueItem, User interfaces
```