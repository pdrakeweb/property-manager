# Architecture Decision Records — Property Manager PWA

**Project:** Property Manager PWA  
**Property:** 2392 Tannerville Rd, Orrville OH + Camp (secondary)  
**Author:** Pete Drake  
**Created:** April 2026

These ADRs document the key architectural decisions for a single-user, no-backend property intelligence PWA. Each decision was made under a consistent set of constraints: no server to maintain, personal device only (for now), free-tier static hosting, and Google Drive as the persistence layer.

---

## ADR-001: OpenRouter vs. Direct Anthropic API

**Status:** Accepted

### Context

The app uses AI for three distinct task classes with different requirements:

- **Nameplate extraction** (vision + structured JSON): high accuracy needed, infrequent, latency-tolerant
- **Document parsing** (warranty PDFs, invoices): moderate accuracy, occasional
- **Advisory / Q&A** (reasoning over property context): best available model, conversational latency acceptable
- **Fast/cheap tasks** (simple lookups, maintenance suggestions): speed and cost matter

If calling the Anthropic API directly, every task goes through Claude regardless of whether that's the right tool for the job. OpenRouter provides a unified API endpoint (`https://openrouter.ai/api/v1/chat/completions`) with OpenAI-compatible request format, covering Claude, GPT-4, Gemini, Mistral, and others under a single API key.

The app has no backend. API keys are stored in `localStorage`. Both approaches expose a key client-side — the question is which key and what access it grants.

### Decision

**Use OpenRouter.**

The `openRouterClient` in `src/lib/apiClient.ts` targets `https://openrouter.ai/api/v1` exclusively. The `TaskType` enum drives model selection from `DEFAULT_MODELS`, which maps each task to the best-fit model:

```typescript
const DEFAULT_MODELS: Record<TaskType, string> = {
  nameplate_extraction:        'anthropic/claude-opus-4-5',   // vision accuracy
  document_parsing:            'anthropic/claude-sonnet-4-6', // cost/quality balance
  maintenance_recommendations: 'anthropic/claude-opus-4-6',  // deep reasoning
  budget_analysis:             'anthropic/claude-opus-4-6',
  general_qa:                  'google/gemini-flash-1.5',     // fast + cheap
  advisory:                    'anthropic/claude-opus-4-6',
};
```

All defaults are user-overridable in Settings.

### Consequences

**Positive:**
- Single API key to manage and rotate; one Settings field, not five.
- Model selection is per-task and runtime-configurable, not build-time. When `gemini-2.0-flash` ships or a better cheap vision model emerges, updating `DEFAULT_MODELS` is a one-liner with no provider credential changes.
- Structured JSON output (`response_format: json_schema`) is supported uniformly across providers, which is critical for the nameplate extraction flow where Zod schemas drive the JSON schema payload.
- ~5% OpenRouter markup on top of provider pricing is offset immediately by using `gemini-flash` for the frequent cheap tasks rather than routing everything through Claude Opus.
- HTTP-Referer and X-Title headers provide usage attribution in the OpenRouter dashboard without any additional instrumentation.

**Negative:**
- OpenRouter is a third-party intermediary. If it goes down, all AI features fail. There is no direct-API fallback. For a personal tool this is acceptable risk, but it's a real dependency.
- The 5% markup is not free. At low personal usage volumes the absolute dollar amount is negligible, but it's worth noting.
- OpenRouter's model availability occasionally lags a provider's latest release by days to weeks. If Anthropic ships a model with a capability this app needs immediately, direct API access would be faster.
- Rate limit errors will be OpenRouter's limits, not Anthropic's. These are generally looser for the use volume here, but the error surface is less predictable.
- `response_format: json_object` vs `json_schema` support varies by model through OpenRouter. The Zod-derived JSON schemas work well with Claude but may produce inconsistent results with Gemini — the nameplate extraction must always route to a Claude model.

---

## ADR-002: Google Drive as Persistence Layer

**Status:** Accepted

### Context

The app needs durable storage for equipment records, photos, service records, and maintenance history. The obvious alternative is a backend database (Supabase, Firebase, PlanetScale, etc.), but that introduces a server to maintain, auth to manage, schema migrations, and recurring cost.

The constraints are strict: no backend server, no recurring infrastructure cost, no proprietary data format that creates vendor lock-in, and the data must be usable outside the app (if the app disappears, the knowledge must survive). The user already has an established Google Drive folder hierarchy at `14CifGAre0egOHO0qVdrVBXCQY0WXk6Wt` with category subfolders already in use.

Google Drive API v3 is callable directly from the browser with OAuth tokens. Files are Google-native and human-readable. Drive's search, sharing, and backup infrastructure are already trusted for personal data.

### Decision

**Google Drive is the sole persistence layer.** No backend database is used at any phase.

Each equipment record is stored as a Markdown file (`{category}_{YYYY-MM-DD}_{HHmm}.md`) in the appropriate Drive subfolder. Photos are uploaded as separate JPEGs, referenced by filename in the Markdown. Each property maintains two AI-context documents:

- `_index.md`: machine-maintained index of all records, service history, open projects, maintenance due
- `_summary.md`: AI-generated property summary, regenerated on demand

A machine-readable `_app_index.json` in the property root enables fast checklist queries without listing folder contents individually. Local IndexedDB (`idb-keyval`) handles the offline queue and a 15-minute cache for `_index.md` and 1-hour cache for `_summary.md` to reduce Drive API calls.

### Consequences

**Positive:**
- Zero backend to maintain. No schema migrations, no server costs, no auth layer beyond what Google already provides.
- The data is human-readable Markdown that works completely independently of this app. If the app never gets built past Phase 1, all captured records are still useful.
- Drive's existing folder hierarchy for 2392 Tannerville is reused — no migration or data lift required.
- AI advisory features load `_index.md` and `_summary.md` as context documents. Drive is the knowledge base without any additional vector DB or indexing infrastructure.
- Google handles backup, mobile sync, and sharing natively. Records are immediately visible on desktop Drive without any export step.

**Negative:**
- Drive is not a database. There is no query engine. The `_index.md` denormalization approach means that whenever a record changes, both the record file and the index document must be updated atomically — or they drift out of sync. Failure mid-upload leaves the index stale.
- Latency for listing folder contents to build the checklist is Drive API round-trip time (typically 200–800ms on mobile), not a local DB query. The `_app_index.json` mitigates this but introduces its own consistency problem.
- Drive API rate limits: 1,000 requests/100 seconds/user. For a single user doing sequential captures this is fine, but bulk operations (initial setup, index rebuilds) need explicit rate-limit handling.
- The 1-hour token expiry means the app must detect 401s and re-auth silently via `prompt=none` with the stored refresh token. This is handled in the Drive client wrapper but is a real failure mode if the refresh token is revoked (e.g., the user revokes app access from their Google account).
- No relational integrity. Deleting a photo file from Drive doesn't update the Markdown that references it. The app has no referential constraint enforcement.
- Multi-user scenarios (Kelly using the app on her device) require careful thought: Drive access is scoped to whoever authenticated. If both users write to the same folder simultaneously, last-write-wins on the index documents. This is noted as an open question and deferred.

---

## ADR-003: OAuth PKCE In-Browser vs. Cloudflare Worker Token Exchange

**Status:** Accepted (with known deferred upgrade path)

### Context

Google OAuth requires an authorization flow to obtain access and refresh tokens for Drive API access. There are two viable approaches for a no-backend SPA:

**Option A: PKCE in the browser.** The app generates a code verifier/challenge, redirects to Google's auth endpoint, receives the authorization code at the redirect URI, and exchanges it for tokens client-side. The refresh token is stored in `localStorage`. No server involved. This is the OAuth 2.0 PKCE flow designed specifically for SPAs.

**Option B: Cloudflare Worker proxy.** A Worker (free tier, no cold-start) holds the OAuth client secret, performs the code exchange server-side, and returns tokens to the browser. The client secret never touches the browser. The Worker can also proxy Drive API calls, keeping both the Google client secret and any AI API keys off the device.

The immediate constraint: single user, personal device, no multi-user requirement yet. Kelly potentially using the app is logged as an open question.

### Decision

**PKCE in the browser (Option A).** The `GoogleAuth.ts` module implements the full PKCE flow. The refresh token is stored in `localStorage`. Token refresh (access tokens expire in 1 hour) is handled transparently in the Drive client wrapper on 401 response.

The Cloudflare Worker option (Option B) is explicitly documented as the upgrade path if multi-user access is needed.

### Consequences

**Positive:**
- Zero infrastructure. No Worker to deploy, monitor, or maintain. No additional failure surface between the browser and Google.
- PKCE is purpose-designed for this exact case — a public client (no client secret) that can't safely hold credentials. Google explicitly supports and recommends it for SPAs.
- The flow is entirely client-side and offline-capable in the sense that once the token is obtained, it works until expiry without any server round-trip.
- Cloudflare Workers free tier is genuinely ~20 minutes of setup if this decision needs to be reversed. The barrier to upgrade is low.

**Negative:**
- The Google OAuth client ID is embedded in the bundle. This is acceptable for a public client (the client ID is not a secret) but is visible to anyone who reads the source.
- The refresh token in `localStorage` is accessible to any JavaScript running on the page. XSS on a `github.io` domain is constrained by the same-origin policy, but it's not zero risk. On a personal device with no shared browser sessions this is acceptable.
- `prompt=none` silent refresh requires third-party cookies to work in the browser, which Safari ITP and Firefox ETP increasingly block. If the silent refresh fails, the user sees an unexpected re-auth prompt. This is a real rough edge on iOS Safari, which is the primary target device.
- There is no server-side token revocation. If the device is compromised, the attacker has Drive access until the user manually revokes from their Google account.
- The "Kelly scenario" is not solvable with PKCE alone. If a second user needs access, either: (a) she authenticates independently with her own Google account (Drive access becomes complicated), or (b) the Cloudflare Worker option is implemented so the app can hold a service account credential. This decision must be revisited before multi-user is attempted.

---

## ADR-004: React SPA + Vite vs. Next.js

**Status:** Accepted

### Context

The choice of application framework shapes the entire development and deployment model. The two realistic options for a TypeScript React app in 2026 are:

**Option A: React SPA + Vite.** A client-rendered single-page application. All routing is client-side (React Router v6). The build output is a static bundle: `index.html` + JS/CSS chunks. Deployable to GitHub Pages, Netlify, Cloudflare Pages — any static host.

**Option B: Next.js.** App Router (server components) or Pages Router. Can do static export (`output: 'export'`) but loses server-side features. The default assumption of server-side rendering creates friction against the no-backend constraint. The ecosystem is increasingly oriented around server components and API routes.

The constraints: no backend, static hosting only (GitHub Pages free tier is the target), no SSR needed, no API routes needed, the entire runtime is the browser.

### Decision

**React SPA + Vite.** The stack is React 18 + Vite + TypeScript + Tailwind CSS + `vite-plugin-pwa` + React Router v6. GitHub Actions deploys to `gh-pages` branch on push to `main`.

Next.js static export was evaluated and rejected for reasons below.

### Consequences

**Positive:**
- The build output is a static bundle that deploys identically to GitHub Pages, Netlify, Cloudflare Pages, or any CDN. No `next.config.js` tuning required to make static export work.
- Vite's dev server HMR is fast. For a project with 20+ category schema files and complex form rendering, this matters for iteration speed.
- `vite-plugin-pwa` generates the service worker and PWA manifest with minimal configuration and first-class Workbox integration for the offline cache strategy. Next.js has no equivalent first-party PWA plugin — the community solutions are maintained inconsistently.
- React Router v6 gives full control over the SPA routing model. Hash routing (`/#/property/...`) works on GitHub Pages without 404 redirect hacks.
- No accidental server coupling. It's impossible to add an API route that creates a backend dependency, because the tooling doesn't support it.

**Negative:**
- No server-side rendering means the initial paint is slower on slow connections — the JS bundle must load before anything renders. For a personal tool installed as a PWA (cached) on a known device this is not a meaningful concern, but it's a real trade-off for any future public distribution.
- Static export on GitHub Pages means all routes must 404-redirect to `index.html`. This requires a `404.html` redirect hack on GitHub Pages that would not be needed on Netlify or Cloudflare Pages.
- SEO is irrelevant for this app, but the pattern trained by years of Next.js usage dies hard. If any future contributor expects Next.js conventions, the SPA model requires re-orientation.
- No API routes means the Cloudflare Worker is the only path to server-side logic if it becomes needed (e.g., token proxying, webhook receipt from Home Assistant). This is fine and was anticipated in ADR-003, but it adds a second deployment target.

---

## ADR-005: Expo vs. Capacitor for Native App Phase

**Status:** Accepted (supersedes spec body §8.2)

### Context

The spec body (§8.2) was written with Capacitor as the native wrapper. The April 11, 2026 architectural decisions update revised this to Expo. This ADR captures the rationale for the reversal.

**Capacitor approach (original spec):** Wrap the existing React DOM PWA in a native WebView shell. The same React components, Drive client, OpenRouter client, and Zustand store run unchanged in a WebView. Native APIs (camera, filesystem, push notifications) are exposed via Capacitor plugins. Single codebase for web + Android. No rewrite.

**Expo approach (decision):** Build the Android app as a React Native application using Expo's managed workflow and EAS Build. The React Native component tree is distinct from the React DOM component tree — `<View>`, `<Text>`, `<TouchableOpacity>` instead of `<div>`, `<p>`, `<button>`. The business logic (Drive client, OpenRouter client, Zod schemas, Zustand stores) is shared; the UI layer is rewritten.

### Decision

**Expo for the native app phase.** The PWA (React DOM) remains the primary target. The native app is a React Native application that shares business logic but has a native UI layer.

This is Phase 7 work. The decision does not affect Phases 1–6.

### Consequences

**Positive:**
- React Native renders native UI components, not a WebView. This matters most for the camera flow: `expo-camera` provides frame processor access, HDR capture, and consistent behavior across Android versions without the WebView rendering overhead that makes Capacitor camera feel slightly laggy on older devices.
- Expo's managed workflow and EAS Build/Submit handle the Android signing, build pipeline, and Play Store submission in a way that is significantly less painful than Capacitor's Gradle integration.
- Push notifications via `expo-notifications` integrate with FCM with less configuration than Capacitor Push Notifications, which matters for the HA-triggered maintenance alerts in Phase 6.
- React Native's `FlatList` and gesture handling outperform a WebView-rendered list for the equipment inventory screen when it grows to 50+ records.
- The Expo ecosystem (file picker, biometrics, share target) is more actively maintained than the equivalent Capacitor plugins as of 2026.

**Negative:**
- **This is not a free upgrade from the PWA.** The UI layer must be rebuilt in React Native components. Every screen — HomeScreen, CategoryScreen, ChecklistScreen, DynamicForm, CameraCapture — requires a React Native equivalent. Tailwind CSS does not apply; NativeWind or StyleSheet is the replacement. This is weeks of work, not days.
- The PWA and the React Native app will diverge over time. UI bugs fixed in one must be ported to the other. Shared logic is easy; shared UI is impossible.
- Capacitor's original appeal was zero rewrite: the PWA runs in a WebView with native API access. That's genuinely valuable for a solo developer. Rejecting it in favor of Expo means accepting the maintenance cost of two UI codebases.
- Expo managed workflow has limits. If a native module outside the Expo ecosystem is needed (e.g., a custom HA WebSocket integration with background capability), the managed workflow may require ejecting to bare workflow, which adds Gradle/Xcode complexity.
- iOS is not in scope per the spec, but Expo targets both platforms by default. Ignoring iOS means leaving half of Expo's value on the table.

---

## ADR-006: `drive` Scope vs. `drive.file` Scope

**Status:** Accepted

### Context

Google Drive OAuth scopes control what the app can access:

- **`https://www.googleapis.com/auth/drive.file`**: Read/write access only to files the app itself created or opened. Cannot list or read pre-existing files in Drive.
- **`https://www.googleapis.com/auth/drive`**: Full read/write access to all files in the user's Drive.

The `drive.file` scope is the principle-of-least-privilege choice and passes Google's OAuth verification with less scrutiny. The `drive` scope requires Google to verify the app's use case if it's published to non-test users, and it grants broader access than strictly required.

The critical question is whether the app needs to read files it didn't create.

### Decision

**Use `drive` (full) scope.**

The checklist screen must detect whether a category already has documentation. The `_index.md` is the canonical record of existing uploads, but on first run or after manual Drive edits, listing folder contents to detect pre-existing files requires `drive` scope. The same applies to reading the existing Drive folder structure at `14CifGAre0egOHO0qVdrVBXCQY0WXk6Wt` that predates this app.

### Consequences

**Positive:**
- The app can read `_index.md`, `_summary.md`, and any record files regardless of whether they were created by this app or uploaded manually through Drive's web UI.
- The checklist's "already documented" state is accurate even if the user manually uploaded a file to Drive outside the app.
- The Drive folder structure that already exists at the property folder root is immediately accessible without re-creating it.
- AI advisory context loading (`_index.md` + `_summary.md` + individual record files) works unconditionally.

**Negative:**
- The OAuth consent screen explicitly tells the user "This app can see and edit all files in your Drive." For a personal tool on a personal device, this is accurate and acceptable, but it looks alarming compared to the scoped alternative.
- `drive` scope triggers Google's OAuth app verification process if the app is ever shared beyond the developer's test account. As long as the app is published as "unverified" (personal use only) or restricted to specific test users, this is not a practical obstacle.
- A bug in the Drive client (wrong folder ID, incorrect file listing logic) could now touch files the app was never intended to manage. The `drive.file` scope would have been a hard guardrail. With `drive` scope, the guardrail is code correctness.
- If the app is ever open-sourced or shared with other users, the `drive` scope will require formal Google verification — a non-trivial process that could take weeks. `drive.file` would not.

---

## ADR-007: Zod Schemas as Source of Truth for Types

**Status:** Accepted

### Context

The app's domain model (equipment records, category field definitions, service records, maintenance tasks, capital items) needs TypeScript types for compile-time safety and a runtime JSON Schema for the OpenRouter structured output feature (`response_format: json_schema`).

There are two ways to maintain these:

**Option A: Plain TypeScript interfaces.** Define `interface Field`, `interface Category`, `interface CaptureRecord`, etc. in `src/schema/types.ts`. These are compile-time only — erased at runtime. A separate JSON Schema must be authored and manually kept in sync for OpenRouter API calls.

**Option B: Zod schemas.** Define `z.object(...)` schemas in `src/schemas/index.ts`. Use `z.infer<typeof Schema>` to derive TypeScript types. Use `zodToJsonSchema()` from `zod-to-json-schema` to generate the OpenRouter `response_format.json_schema` payload at call time. One source of truth for both TS types and runtime validation.

### Decision

**Zod schemas are the source of truth.** TypeScript interfaces are derived via `z.infer<>`, not authored separately. `zodToJsonSchema()` generates the JSON schema for OpenRouter calls. Runtime validation of AI responses uses `schema.safeParse(response)`.

```typescript
// src/schemas/index.ts
export const FieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'date', 'select', 'textarea', 'boolean']),
  options: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
  aiExtractHint: z.string().optional(),
  required: z.boolean().optional(),
  unit: z.string().optional(),
});

export type Field = z.infer<typeof FieldSchema>;

// For OpenRouter structured output:
const jsonSchema = zodToJsonSchema(NameplateExtractionSchema, { name: 'NameplateExtraction' });
```

### Consequences

**Positive:**
- AI extraction responses are validated at runtime before touching the form. If the model returns a field with the wrong type or a missing required key, `safeParse` catches it cleanly and the error path triggers a manual entry fallback — instead of a runtime crash or silent wrong data in a form field.
- The OpenRouter `response_format.json_schema` payload is always in sync with the TypeScript type. There is no scenario where the JSON schema sent to the API diverges from the TS type the response is parsed into.
- `zodToJsonSchema()` handles nested objects, enums, optionals, and `z.discriminatedUnion()` correctly. Hand-authoring an equivalent JSON Schema for even the moderately complex `CaptureRecord` type would be error-prone.
- Zod's `z.enum()` for field types and `z.literal()` for record types provides discriminated union support that TypeScript `interface` union types provide at compile time but not at runtime.
- Adding a new category field type (e.g., a `coordinates` field for GPS location capture) requires updating the Zod schema once. The TypeScript type, the JSON schema for OpenRouter, and the runtime validation all update automatically.

**Negative:**
- Zod adds a runtime dependency (~13KB minified + gzipped). For a PWA where bundle size affects first load on mobile, this is real. It's outweighed by the benefit, but it's not free.
- `zodToJsonSchema()` does not always produce JSON Schemas that every OpenRouter model accepts without massaging. Gemini Flash in particular is strict about `additionalProperties: false` and sometimes rejects schemas with complex `anyOf` patterns. The nameplate extraction schemas must stay simple and Claude-targeted.
- Developers unfamiliar with Zod need to learn the builder syntax. The `z.infer<typeof X>` pattern is not immediately obvious to someone coming from plain TypeScript. For a solo project this is a non-issue.
- Complex conditional field rendering (e.g., show `uv_lamp_part` only if `equipment_type === 'UV Sterilizer'`) is handled in the UI layer (`DynamicForm.tsx`), not the Zod schema, because Zod's `z.discriminatedUnion()` requires exhaustive typing that doesn't compose cleanly with the runtime category definition pattern. The schema validates structure; display logic stays in the component.
