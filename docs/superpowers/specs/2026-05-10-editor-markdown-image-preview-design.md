# Hapi Editor Markdown & Image Preview Design

Date: 2026-05-10
Status: Approved for planning

## Goal

Add Markdown preview and Image preview to Hapi Editor Mode. When a user opens a `.md` file, they can toggle between Source view (CodeMirror editor) and Preview view (rendered markdown). When a user opens an image file, it displays inline with metadata.

## Non-goals

- PDF, CSV, or other binary file preview (future work).
- Inline image rendering inside markdown preview (markdown images show as regular `img` tags, no special handling).
- Editing markdown in preview mode (preview is read-only; switch to Source to edit).
- Terminal-based image/markdown rendering (this is Web PWA only).

## Current codebase baseline

Existing pieces:

- **EditorTabs.tsx** (`web/src/components/editor/EditorTabs.tsx`, ~590 lines): Central file viewer/editor using CodeMirror 6. Supports syntax highlighting for JS/TS/JSON/CSS/HTML/Markdown/Python/Rust/Go. Handles tab management, dirty tracking, save.
- **useEditorState.ts** (`web/src/hooks/useEditorState.ts`, ~204 lines): Central state management for editor tabs.
- **editorRpc.ts** (`cli/src/modules/editorRpc.ts`, ~459 lines): File CRUD RPC handlers. Currently rejects binary files in `editor-read-file` (checks for null bytes and control chars, max 5MB).
- **Hub editor routes** (`hub/src/web/routes/editor.ts`, ~333 lines): REST API routes for `/api/editor/*`.
- **Existing markdown deps in web**: `@assistant-ui/react-markdown` v0.11.9, `remark-gfm`, `remark-math`, `rehype-katex`, `shiki` v3.20.0, `hast-util-to-jsx-runtime`.
- **Web API client** (`web/src/api/client.ts`): 30+ editor methods including `readEditorFile`.

Missing pieces:

- No view mode toggle (Source/Preview) in EditorTabs.
- No markdown rendering component for editor (existing `markdown-text.tsx` is for chat bubbles, not document preview).
- No image preview at all.
- No raw binary file serving endpoint.

## File type detection

Based on file extension, determined in EditorTabs:

| Extension | Default view | Toggle available |
|-----------|-------------|-----------------|
| `.md`, `.mdx`, `.markdown` | Source | Source / Preview |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp` | Preview | Preview only |
| All others | Source | Source only (no change) |

File type detection uses the existing `activeTab.path` from `useEditorState`. Match against lowercase extension using `path.extname()` or string matching.

## UI design

### Markdown: Source/Preview tabs

When a markdown file is open, two tab buttons appear above the editor area:

```
[Source]  [Preview]          ← toggle buttons (pill/segmented style)
┌──────────────────────────┐
│                          │
│  CodeMirror (Source)     │  ← Source mode: existing CodeMirror editor
│  or                      │
│  MarkdownPreview         │  ← Preview mode: rendered markdown
│                          │
└──────────────────────────┘
```

Toggle state is **per-tab**, stored in `useEditorState`. Each tab tracks its own `viewMode: 'source' | 'preview'`.

### Image: Inline preview with metadata

When an image file is open:

```
┌──────────────────────────┐
│ 📷 filename.png          │  ← metadata bar
│ 1920 x 1080 · 245 KB    │
│                          │
│                          │
│     [image display]      │  ← centered, max-width, fit-to-container
│                          │
│                          │
└──────────────────────────┘
```

- Image uses `<img>` with `max-width: 100%`, `max-height: 100%`, `object-fit: contain`, centered in the editor area.
- Background: dark/neutral background to handle transparent images.
- Scrollable if image exceeds viewport height.
- Metadata bar shows: icon + filename + dimensions + file size.
- No Source/Preview toggle (image source is not editable text).

### Visual design rules

- Match existing Editor density and theme tokens:
  - `--app-bg`, `--app-fg`, `--app-hint`, `--app-border`, `--app-divider`, `--app-subtle-bg`, `--app-secondary-bg`
- Source/Preview toggle: pill-style segmented buttons, matching Editor's existing interaction patterns.
- Markdown preview styling: document-style (not chat bubble). Use `prose`-like CSS for typography (headings, paragraphs, lists, blockquotes, code blocks).
- Code blocks in markdown preview: reuse `shiki` for syntax highlighting (already in deps).
- Image background: `--app-subtle-bg` or a dark neutral for transparency support.
- Preserve light, dark, and Telegram theme support through CSS variables.

### View mode persistence

The `viewMode` state is part of the tab state in `useEditorState`, which persists to `sessionStorage`. When a user reopens the editor or restores a tab, the last-used view mode (Source or Preview) is restored.

### Mobile

In `MobileEditorLayout`, when the "Editor" view is active and the file supports preview, show the same Source/Preview toggle. The preview renders full-width in the single-column mobile layout.

### Loading and error states

- **Loading**: Show a skeleton/spinner while fetching file content.
- **Image load error**: Show broken image icon + filename + "Could not load image" message.
- **Image too large**: If file exceeds 10MB, show "File too large to preview" message with file size.
- **Markdown render error**: If markdown parsing fails, fallback to showing raw text with a warning banner.

## Backend: Raw binary endpoint

### CLI: `editorRpc.ts`

New handler: `editor-read-file-raw`

```typescript
{
  method: 'editor-read-file-raw',
  input: { path: string },
  output: { data: string /* base64 */, mimeType: string, size: number }
}
```

- Resolve path inside `editorRoot` (same path isolation as existing handlers).
- Stat file first to get size. Reject if > 10MB.
- Read file as Buffer, return base64-encoded data.
- Detect MIME type using file extension mapping:
  - `.png` → `image/png`
  - `.jpg`, `.jpeg` → `image/jpeg`
  - `.gif` → `image/gif`
  - `.svg` → `image/svg+xml`
  - `.webp` → `image/webp`
- For unsupported binary types, return 415 Unsupported Media Type.

### Hub: `routes/editor.ts`

New route: `POST /api/editor/file/raw`

Request body:
```json
{
  "machine": "string",
  "path": "string"
}
```

Response:
- Status 200 with body as raw bytes
- `Content-Type` header set to the detected MIME type (e.g., `image/png`)
- `Cache-Control: private, max-age=300` (5-minute browser cache)
- `Content-Length` header set

Auth: Reuse existing editor endpoint session authentication middleware. The `getEditorFileRawBlob` method in the API client POSTs to the endpoint with the same auth, then creates an object URL for `<img>` display.

Error responses:
- 400: Invalid path or unsupported file type
- 404: File not found
- 413: File too large (> 10MB)
- 415: Unsupported media type

### Hub: `syncEngine.ts` + `rpcGateway.ts`

New method: `readEditorFileRaw(machineId: string, path: string)`

- Calls `editor-read-file-raw` RPC on the target machine.
- Returns `{ buffer: Buffer, contentType: string, size: number }` to the route handler.
- Route handler sets headers and pipes the buffer as response body.

### Web: `ApiClient`

New method:

```typescript
async getEditorFileRawBlob(machine: string, path: string): Promise<Blob>
```

Posts to `/api/editor/file/raw`, receives raw bytes with `Content-Type` set, returns a `Blob` object. The calling component creates an object URL via `URL.createObjectURL(blob)` for `<img>` tag use. File metadata (size, mimeType) comes from response headers. Dimensions are resolved client-side after the image loads (read `naturalWidth` / `naturalHeight` from the loaded `<img>` element).

## Data flow

### Markdown

```
User opens .md file
  → EditorTabs reads file via existing readEditorFile (text, base64-decoded)
  → Source mode: CodeMirror (existing)
  → Preview mode: react-markdown renders the text content
  → When file is saved in Source mode, useEditorFile refetch triggers preview re-render
```

No backend changes needed for markdown rendering.

### Image

```
User opens image file
  → EditorTabs calls api.getEditorFileRawBlob(machine, path)
  → POST /api/editor/file/raw → Hub → syncEngine → rpcGateway → CLI
  → CLI reads file, returns base64 + mimeType + size
  → Hub decodes base64, returns raw bytes as Blob with Content-Type + Content-Length
  → EditorTabs creates blob: URL with URL.createObjectURL(blob)
  → <img src={blobUrl}> renders the image
  → Image onLoad → read naturalWidth/naturalHeight → show metadata
  → Cleanup: URL.revokeObjectURL(blobUrl) on unmount or path change
```

Metadata (size, mimeType) is read from Blob properties (`blob.size`, `blob.type`). Dimensions are read from the loaded `<img>` element (`naturalWidth`, `naturalHeight`). Object URL is revoked on tab close or path change to prevent memory leaks.

## Component changes

### EditorTabs.tsx

Modifications:
1. Detect file type from `activeTab.path` extension.
2. Add `viewMode` state per tab (tracked in `useEditorState`).
3. For markdown files: render Source/Preview toggle buttons above editor area.
4. For image files: render `ImagePreview` component instead of CodeMirror.
5. For Source mode (and non-markdown files): render CodeMirror (unchanged).

The toggle and preview rendering is inline within EditorTabs — no separate panel components to keep EditorTabs self-contained.

### EditorTabs CSS

New CSS class for:
- `.editor-preview-toggle`: Segmented pill button group for Source/Preview.
- `.editor-markdown-preview`: Document-style markdown container with prose typography.
- `.editor-image-preview`: Image container with metadata bar and centered image.

### useEditorState.ts

Add to tab state:
```typescript
interface EditorTab {
  // ... existing fields ...
  viewMode?: 'source' | 'preview'  // only meaningful for markdown files
}
```

New setter: `setTabViewMode(tabId: string, mode: 'source' | 'preview')`

## Testing strategy

### CLI tests (`cli/src/modules/editorRpc.test.ts`)

- `editor-read-file-raw` returns image data for valid image path.
- `editor-read-file-raw` rejects paths outside editorRoot.
- `editor-read-file-raw` rejects unsupported binary types.
- `editor-read-file-raw` rejects files > 10MB.
- MIME type detection is correct for all supported extensions.

### Hub tests (`hub/src/sync/syncEngine.editor.test.ts`)

- `readEditorFileRaw` returns buffer with correct contentType.
- Route `/api/editor/file/raw` returns 200 with correct Content-Type.
- Route returns 404 for missing files.
- Route returns 413 for oversized files.
- Route returns 415 for unsupported types.

### Web tests

- EditorTabs shows Source/Preview toggle for `.md` files.
- EditorTabs shows no toggle for non-markdown files.
- Markdown preview renders headings, bold, italic, lists, code blocks correctly.
- Code blocks have syntax highlighting via shiki.
- Image files show inline preview with metadata.
- Image preview shows error state for broken images.
- Source/Preview toggle state persists per tab.
- Switching tabs preserves each tab's viewMode.

## Edge cases

- **File renamed while open**: If a user renames a `.md` to `.txt`, the toggle should disappear (view mode resets to source).
- **Very large markdown files**: Preview mode should not freeze the browser. Consider a render timeout or chunked rendering for files > 500KB.
- **SVG security**: SVG files should be rendered via `<img>` tag (not inline), which prevents script execution.
- **Concurrent raw requests**: Multiple image tabs may issue simultaneous requests. The raw endpoint should handle concurrent access.
- **Empty markdown file**: Show empty state message in preview.
- **Markdown with only frontmatter**: Show "No content" message in preview.
