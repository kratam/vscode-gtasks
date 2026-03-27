# vscode-gtasks

VSCode extension: gyors task capture Google Tasks-ba, workspace-alapú task listákkal.

## Felvetés

Claude Code session közben gyakran jut eszembe valami TODO/ötlet amit később kéne megcsinálni. Jelenleg nincs gyors mód ezt rögzíteni anélkül, hogy megzavarná a flow-t. Kell egy billentyűkombó → input box → done megoldás.

### Követelmények

- **Gyors capture:** egy hotkey → input box → Enter → kész, max 3 mp
- **Workspace-aware:** a VSCode workspace neve alapján automatikusan a megfelelő Google Tasks listába kerüljön
- **Auto-create list:** ha nincs még ilyen nevű task lista, hozza létre
- **Opcionális kontextus:** ha van kijelölt szöveg, az is kerüljön a task megjegyzésébe (fájl + sor hivatkozással)
- **MCP kompatibilitás:** a Google Workspace MCP (`manage_tasks`) már konfigurálva van — Claude skill-ből is lehessen olvasni/írni a task-okat

## Kutatás

### Meglévő megoldások — nincs ami megfelelne

| Megoldás | Probléma |
|---|---|
| `KrishnaPravin.google-tasks` VSCode ext | Read-only tree view, 2021 óta elhagyott |
| Google Tasks CLI (`BRO3886/gtasks`) | Jó CLI, de nincs VSCode integráció (input box) |
| Todoist VSCode (`waymondo.todoist`) | Pont a kívánt UX, de Todoist-hoz kötött, nem Google Tasks |
| Apple Reminders | Nincs jó MCP/API, nincs VSCode integráció |
| TODO.md kézzel | Működik, de lassú (`- [ ]` gépelés), nincs sync más eszközökre |
| Markdown Checkbox ext-ek | Gyorsítják a TODO.md szerkesztést, de nem external sync |

### Referencia implementáció

**[waymondo/vscode-todoist](https://github.com/waymondo/vscode-todoist)** — a legjobb minta:
- `Alt+T C` → quick add input box
- Kijelölt szöveg → deep link kontextus a task-ban
- Sidebar tree view a task-ok böngészéséhez
- ~500 sor, egyszerű kódbázis

### Elérhető Google Tasks API-k

1. **Google Tasks REST API** — direkt OAuth2, teljes CRUD
2. **Google Workspace MCP** (`mcp__google-workspace__manage_tasks`) — már konfigurálva, Claude-ból elérhető
3. **`gtasks` Go CLI** — wrapper a REST API fölött, auth-ot kezeli

## Terv

### Architektúra

```
vscode-gtasks/
├── src/
│   ├── extension.ts          # activate/deactivate, command regisztráció
│   ├── google-tasks-api.ts   # Google Tasks API client (OAuth2)
│   ├── task-list-manager.ts  # lista keresés/létrehozás workspace név alapján
│   ├── quick-add.ts          # input box UI + task létrehozás
│   └── tree-view.ts          # sidebar task lista (v2)
├── package.json              # extension manifest, commands, keybindings
├── tsconfig.json
└── README.md
```

### Auth megközelítés

Google OAuth2 Device Flow vagy Authorization Code Flow:
- GCP project + OAuth consent screen (saját használatra "Testing" mód elég, nem kell publish)
- Client credentials JSON a `~/.config/vscode-gtasks/` mappában
- Token refresh automatikusan
- Scope: `https://www.googleapis.com/auth/tasks`

### UX flow

```
1. User megnyomja Cmd+Shift+G (vagy egyéni hotkey)
2. VSCode showInputBox() felugrik: "Add task to [WorkspaceName]..."
3. User beírja: "NTAK export refaktor"
4. Enter →
   a. Megkeresi a "[WorkspaceName]" nevű task listát Google Tasks-ban
   b. Ha nincs → létrehozza
   c. Létrehozza a task-ot
   d. Ha volt kijelölt szöveg → notes mezőbe: "Context: file.ts:42\n<selected text>"
5. Status bar notification: "Task added to [WorkspaceName]"
```

## TODO

### v0.1 — MVP (quick add)

- [ ] GCP project + OAuth consent screen setup leírás
- [ ] Projekt scaffold: `yo code` generátor, TypeScript, esbuild
- [ ] Google Tasks API client implementálás (OAuth2 + token storage)
- [ ] `quickAdd` command: input box → task létrehozás
- [ ] Workspace név → task list mapping (auto-create)
- [ ] Kijelölt szöveg kontextus (fájl + sor)
- [ ] Status bar feedback ("Task added")
- [ ] Keybinding: `Cmd+Shift+G` (konfiguálható)
- [ ] README: telepítés, GCP setup, használat

### v0.2 — Tree view + sync

- [ ] Sidebar tree view: task listák + task-ok
- [ ] Task toggle (complete/reopen) a tree view-ból
- [ ] Task törlés
- [ ] Auto-refresh

### v0.3 — Claude integráció

- [ ] Claude skill: `/next-task` — kiolvassa a workspace task listáját és javasolja a következő teendőt
- [ ] Claude skill: `/add-task` — hozzáad egy task-ot (MCP-n keresztül, nem az extension-ön)
- [ ] Dokumentáció: hogyan használd Claude Code-dal együtt

### Későbbi ötletek

- [ ] Due date support (natural language: "holnap", "péntekig")
- [ ] Priority support
- [ ] Sub-tasks
- [ ] Task keresés (fuzzy)
- [ ] Multi-workspace support (monorepo: subfolder → külön lista)
- [ ] Marketplace publish
