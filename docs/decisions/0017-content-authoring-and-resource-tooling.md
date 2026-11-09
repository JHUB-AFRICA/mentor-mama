# ADR 0017 — Content authoring and resource tooling

**Status:** Accepted for the Content/Learning implementation slice  
**Date:** 2026-09-15  
**Scope:** Portal authoring and resource-consumption UI

## Decision

Adopt a small, self-hosted frontend tooling set for the unified Content Library:

| Need | Decision | Reason |
| --- | --- | --- |
| Native Guide authoring | Tiptap OSS: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, Link, Image, Placeholder | Headless React integration, controlled extension set, structured JSON output, MIT licence |
| PDF preview | `react-pdf` | React wrapper around PDF.js for in-app PDF page rendering; keeps DOCX/PPTX as download/open resources |
| Video playback | Native HTML5 `<video>` for the first slice | No package cost for basic MP4/WebM playback; keeps captions and controls under product control |
| Quiz authoring | Existing React Hook Form + Zod and Learning domain models | Quizzes already have domain-owned scoring and completion rules; a second quiz engine would create conflicting authority |
| Uploads | Browser file input and Django upload contract initially | The storage and security boundary is not yet defined; avoid adding an uploader that assumes S3, Transloadit, or another provider |

All newly installed package versions are pinned exactly in the portal manifest and lockfile.

## Alternatives considered

### Lexical

Lexical is a credible MIT-licensed React editor with JSON/Markdown/HTML
serialization and strong performance characteristics. Tiptap was selected because
its ProseMirror schema and extension ecosystem provide a shorter path to the
required Guide features: headings, lists, links, images, callouts, and custom
resource nodes. This is a replaceable frontend boundary; the backend must persist
versioned structured content rather than editor-specific HTML.

### Uppy

Uppy is MIT-licensed and provides polished upload state, resumability, remote
sources, and React headless components. It is intentionally deferred until the
backend defines a real upload contract and storage boundary. The first supported
resource flow is small enough to use a constrained file input and multipart
request. Uppy becomes appropriate when large files, resumable uploads, signed
object-storage uploads, or remote sources are required.

### Video.js

Video.js is a capable open-source HTML5 player, but the first MentorMAMA learning
slice only requires standard video playback. It should be reconsidered if the
product adds adaptive streaming, DRM, provider-specific playback, playlists, or
advanced caption/analytics requirements.

### H5P

H5P supports interactive video and many question types, but it is primarily an
interactive-content ecosystem and integration contract rather than a small React
component. Adopting it now would introduce package/content-runtime governance,
authoring compatibility, and completion-mapping work. MentorMAMA's existing
Learning domain already owns quizzes, pass marks, attempts, and module completion.
H5P remains a future option for richer interactive video or imported learning
packages, not the foundation of the first module builder.

## Integration boundaries

- Tiptap JSON belongs to a Guide revision and must be validated and sanitised at
  the server boundary before rendering.
- `ContentItem` owns Guides, Documents, and External Resources.
- `TrainingModule` owns Learning Modules, lessons, quizzes, attempts, and
  completion. The placement release guard continues to call Learning services.
- The unified library is a discovery/read model. It must not infer completion from
  opening a guide, downloading a document, or playing a video.
- Files require server-side MIME, extension, size, ownership, access, and malware
  policy checks. A client-selected file type is never trusted.

## Rollback

Remove the Tiptap and `react-pdf` imports and dependencies, revert the portal
lockfile, and fall back to the current plain-text guide form and download-only
resource presentation. No backend schema depends on these frontend packages.

## Sources

- [Tiptap React installation](https://tiptap.dev/docs/editor/getting-started/install/react)
- [Tiptap open-source and licensing](https://tiptap.dev/open-source-to-platform)
- [Tiptap StarterKit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit)
- [Lexical repository and capabilities](https://github.com/facebook/lexical)
- [Uppy React integration](https://uppy.io/docs/react/)
- [react-pdf documentation](https://react-pdf.org/docs/v4)
- [PDF.js getting started](https://mozilla.github.io/pdf.js/getting_started/)
- [Video.js API documentation](https://docs.videojs.com/)
- [H5P content types](https://h5p.org/content-types-and-applications)
