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

## 7. Home Dashboard — Drag & Drop com Cascade Animation

**Padrão obrigatório para a home com cards de módulos reordenáveis.** Combina 3 efeitos:
1. **Drag & drop** suave (cards deslizam quando arrastados)
2. **Cascade animation** ao entrar na home (um por um)
3. **Sem pisca** (cards começam invisíveis, depois aparecem)

**Referência**: [src/pages/DashboardHome.tsx](src/pages/DashboardHome.tsx)

### 7.1. Estrutura — wrapper div + inner button

**A regra de ouro**: o `setNodeRef` e o `transform` do dnd-kit ficam em um `<div>` wrapper. O `<button>` interno recebe a animação de cascade. **Nunca** misture `transform` de animação CSS com `transform` do dnd-kit no mesmo elemento — o `animation-fill-mode: both` sobrescreve o transform inline.

```tsx
// CORRETO — wrappers separados
<div ref={setNodeRef} style={buttonStyle /* transform + transition */}>
  <button onClick={...} {...attributes} {...listeners}>
    <div className={visible ? 'animate-cascade-card' : 'opacity-0'}>
      {/* conteúdo */}
    </div>
  </button>
</div>

// ERRADO — tudo no mesmo elemento (cascade vai matar o transform do drag)
// <button ref={setNodeRef} style={{ transform: ... }} className="animate-cascade-card">
```

### 7.2. animateLayoutChanges — só bloqueia animação no drop

```ts
useSortable({
  id: mod.to,
  animateLayoutChanges: (args) => {
    if (args.wasDragging) return false;   // sem animação ao soltar
    return defaultAnimateLayoutChanges(args);  // outros cards deslizam durante drag
  },
});
```

### 7.3. Cascade animation — trigger por localStorage mount count

**O problema**: `useRef` e `useState` resetam a cada remount do componente. Sem isso, o contador nunca chega a `> 1`.

**Solução**: guardar contador de mounts no localStorage, que persiste entre remounts.

```ts
const MOUNT_COUNT_KEY = 'vrbright_home_mounts';
const [cascadeIndex, setCascadeIndex] = useState(-1); // -1 = all visible

useEffect(() => {
  const count = parseInt(localStorage.getItem(MOUNT_COUNT_KEY) || '0', 10);
  localStorage.setItem(MOUNT_COUNT_KEY, String(count + 1));
  if (count > 0) setCascadeIndex(0);   // animação cascata
  else setCascadeIndex(cards.length);  // 1ª vez: aparece tudo direto
}, []);

// Avança um card a cada 70ms
useEffect(() => {
  if (cascadeIndex < 0 || cascadeIndex >= cards.length) return;
  if (cascadeIndex === 0) { setCascadeIndex(1); return; }
  const t = setTimeout(() => setCascadeIndex(i => i + 1), 70);
  return () => clearTimeout(t);
}, [cascadeIndex, cards.length]);

// Visibilidade por card
visible={cascadeIndex < 0 || i < cascadeIndex}
```

### 7.4. CSS — registrar animação no `@theme` do Tailwind v4

**Cuidado**: com `@tailwindcss/vite`, animações definidas como CSS puro fora do `@theme` são **dropadas em prod**. A classe `animate-cascade-card` precisa ser registrada:

```css
/* src/index.css */
@theme {
  --animate-cascade-card: cascadeCard 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes cascadeCard {
  from { opacity: 0; transform: translateY(18px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.animate-cascade-card {
  animation: var(--animate-cascade-card);
}
```

### 7.5. DndContext config

```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragStart={handleDragStart}  {/* track activeId pra desabilitar transição no card arrastado */}
  onDragEnd={handleDragEnd}
  autoScroll={false}             {/* evita scroll horizontal ao arrastar */}
  modifiers={[restrictToWindowEdges]}  {/* card não sai do viewport */}
>
  <SortableContext items={cards.map(c => c.to)} strategy={rectSortingStrategy}>
    <div className="grid grid-cols-2 gap-3 px-1 pb-4 overflow-x-hidden">
      {cards.map(...)}
    </div>
  </SortableContext>
</DndContext>
```

### 7.6. Sensors (mobile-friendly)

```ts
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
);
```

### 7.7. Estilo do wrapper (drag)

```ts
const buttonStyle: React.CSSProperties = {
  transform: CSS.Translate.toString(transform),
  transition,  // vem do useSortable
  zIndex: isDraggingThis ? 50 : 'auto',
};
```

**Não** setar `transition: 'none'` no card arrastado — o slide dos outros cards depende dessa transição estar ativa.

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