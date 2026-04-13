Это личный внутренний набор инструментов для сборки и доставки npm пакетов и гитхаб репозиториев.

## `defineLibViteConfig`: файлы в dist из другого каталога (монорепо)

После `vite build` плагин «Preparing dist folder» копирует в `dist` стандартные `LICENSE`, `README.md` и `package.json`, ищя их **только рядом с пакетом** (текущий рабочий каталог). Если в монорепозитории эти файлы лежат в корне репо, а пакет — в `packages/core`, появляются предупреждения `not found, skipping`, а в tarball публикации нет лицензии и readme.

Опционально можно задать явные пути через поля конфига (те же опции попадают в `prepareDistDir`):

- **`distExtraFiles`** — список `{ from: string; to?: string }`. Путь `from` разрешается как `path.resolve(resolveBase, from)`, где `resolveBase` = `path.resolve(process.cwd(), distExtraFilesResolveBase ?? '.')`. Поле `to` — путь внутри `dist` (по умолчанию basename исходного файла).
- **`distExtraFilesRoot`** + **`distExtraFilesNames`** — то же через общий каталог: для каждого имени копируется `path.resolve(resolveBase, distExtraFilesRoot, name)` → `dist/<name>`.
- **`distExtraFilesResolveBase`** — смещение базы разрешения путей относительно `process.cwd()` (корень пакета при сборке).
- **`distExtraFilesFailOnMissing`** — если `true`, отсутствие файла из этого набора **прерывает** подготовку dist; по умолчанию `false` — только предупреждение с **абсолютным** путём.

Пока вы **не** задаёте `distExtraFiles` и пару `distExtraFilesRoot` + `distExtraFilesNames`, поведение не меняется.

### Пример для pnpm workspace

Корень репозитория: `./LICENSE`, `./README.md`. Пакет: `packages/core` без локальных копий.

`packages/core/vite.config.ts`:

```ts
import { defineLibViteConfig } from 'sborshik/vite';
// …

export default defineLibViteConfig(configs, {
  distExtraFiles: [
    { from: '../../LICENSE' },
    { from: '../../README.md' },
    // { from: '../../NOTICE', to: 'NOTICE' },
  ],
});
```

Эквивалент через корень и имена:

```ts
defineLibViteConfig(configs, {
  distExtraFilesRoot: '../../',
  distExtraFilesNames: ['LICENSE', 'README.md'],
});
```

Копирование выполняется после артефактов сборки, сразу после стандартного копирования `LICENSE` / `README.md` / `package.json` из каталога пакета, до обновления `dist/package.json`.

## CLI: `sborshik ci`

Команда для CI-публикации пакетов монорепозитория через Changesets:

```bash
sborshik ci
```

### GitHub tags and releases

После успешной публикации можно автоматически создавать git-теги и GitHub Releases только для пакетов, опубликованных в текущем запуске:

```bash
sborshik ci --github-releases
```

Поддерживается алиас:

```bash
sborshik ci --create-github-releases
```

Что делает флаг:

- формирует тег `${packageName}@${version}` для каждого опубликованного пакета;
- если тег уже есть локально или в `origin`, пишет `skipped`;
- если тега нет, создает и пушит его;
- проверяет GitHub Release по тегу;
- если релиз уже существует, пишет `skipped`;
- если релиза нет, создает release с:
  - `title = tagName`
  - `generate_release_notes = true`
  - `make_latest = false`

### Required environment

- `GITHUB_TOKEN` — обязателен только при использовании `--github-releases` / `--create-github-releases`.

Если флаг не передан, поведение `sborshik ci` не изменяется.
