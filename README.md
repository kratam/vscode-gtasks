# vscode-gtasks

VSCode extension: gyors task capture Google Tasks-ba, workspace-alapú task listákkal.

## Features

### Quick Add (`Cmd+Shift+G`)

1. Megnyomod `Cmd+Shift+G`
2. Beírod a task nevét + opcionális @tag-eket
3. Enter → opcionális details input (Esc = skip)
4. Task létrejön a workspace nevével megegyező Google Tasks listában

**@tag-ek:**
- `@next` — lista elejére helyezi (magas prioritás)
- `@today` / `@tomorrow` — mai/holnapi deadline
- `@3d` / `@3day` / `@3days` — N nap múlva
- `@2w` / `@2week` / `@2weeks` — N hét múlva

**Kijelölt szöveg kontextus:** ha van kijelölt szöveg az editorban, automatikusan bekerül a task notes-ba (fájl + sorhivatkozás, dedented, max 30 sor / 1000 karakter).

### Pick Task → Claude (`Cmd+K, Cmd+T`)

1. Megnyomod `Cmd+K, Cmd+T`
2. Dropdown a workspace task listájából
3. Kiválasztod → új Claude Code tab nyílik a task szövegével mint initial prompt
4. A Google Task notes-ba mentődik a Claude session ID (`s[sessionId]`)
5. Legközelebb ugyanazt a task-ot választva → ugyanaz a Claude session folytatódik

## Architektúra

```
User → VSCode Extension → Google Tasks REST API (OAuth2 token from macOS keychain)
```

A `gtasks` Go CLI-vel közös OAuth2 token-t használja (macOS keychain-ből olvassa). Nincs saját auth flow — a `gtasks login` parancsot kell egyszer futtatni.

```
src/
├── extension.ts      # command regisztráció
├── gtasks-cli.ts     # Google Tasks REST API client + OAuth2 token kezelés
├── quick-add.ts      # quick add command: input box + @tag parsing
└── pick-task.ts      # task picker → Claude Code integráció
```

## Telepítés

### Előfeltételek

1. [gtasks CLI](https://github.com/BRO3886/gtasks) telepítve és bejelentkezve:
   ```bash
   curl -fsSL https://gtasks.sidv.dev/install | bash
   gtasks login
   ```

2. [Claude Code VSCode extension](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) (a Pick Task feature-höz)

### Extension telepítés

```bash
cd vscode-gtasks
npm install
npm run build
ln -sfn "$(pwd)" ~/.vscode/extensions/vscode-gtasks
```

VSCode-ban: `Cmd+Shift+P` → "Reload Window"

## TODO

### v0.1 — MVP ✅

- [x] Google Tasks REST API client (OAuth2 token from keychain)
- [x] `quickAdd` command: input box → task létrehozás
- [x] Workspace név → task list mapping (auto-create)
- [x] Kijelölt szöveg kontextus (fájl + sor, dedented)
- [x] @tag-ek: `@next`, `@today`, `@tomorrow`, `@3d`, `@2w`
- [x] Opcionális details (második input box)
- [x] Status bar feedback
- [x] Keybinding: `Cmd+Shift+G`
- [x] Pick Task → Claude Code integráció (`Cmd+K, Cmd+T`)
- [x] Session tracking: Claude session ID mentése a task notes-ba

### v0.2 — Tree view + sync

- [ ] Sidebar tree view: task listák + task-ok
- [ ] Task toggle (complete/reopen) a tree view-ból
- [ ] Task törlés
- [ ] Auto-refresh

### Későbbi ötletek

- [ ] Priority support
- [ ] Sub-tasks
- [ ] Task keresés (fuzzy)
- [ ] Multi-workspace support (monorepo: subfolder → külön lista)
- [ ] Marketplace publish
