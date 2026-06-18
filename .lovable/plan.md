# Plugin Inventory Intelligence — Phase 2

Four targeted upgrades. No new tables, no migration, no route changes.

## 1. Admin Plugin Inventories — real pagination

In `src/pages/AdminPage.tsx`:
- Stop loading inventories in the top-level `load()`; let the tab own its data.
- `InventoriesTab` fetches its own page with `.select(..., { count: "exact" })` + `.range(from, to)`, 50 rows per page, ordered by `updated_at desc`.
- Add `page` state + Prev / Next controls + "Page X of Y · N total" indicator.
- Search input still filters the currently loaded page (with a small "Search applies to this page" hint) so it stays responsive without a join on emails.
- CSV export keeps exporting the rows currently shown.

## 2. Chat — Owned tools panel + prioritized-plugin badges

In `src/components/SenseiChat.tsx`:
- New collapsible "Your owned tools" panel (mirrors the existing eligibility panel styling). Lists counts and chips for native / third-party / custom from `usePluginInventory()`. Shown only when `isComplete`. If empty, shows a one-line nudge linking to `/plugin-inventory`.
- After each assistant reply, scan the message text for case-insensitive mentions of the user's owned plugin/brand names and render a small "Sensei prioritized:" row of badges directly under that assistant bubble. Pure client-side parse — no edge-function change.

## 3. Custom plugins — autocomplete + dedupe

- Add a `CUSTOM_PLUGIN_SUGGESTIONS` catalog to `src/lib/plugin-inventory-constants.ts` (common 3rd-party instruments/effects users frequently type: Serum, Vital, Kontakt 7, Omnisphere, Massive X, Diva, Pigments, Spire, Sylenth1, Nexus, Decapitator, etc.).
- In `src/pages/PluginInventoryPage.tsx`:
  - As the user types in the custom field, show up to 6 suggestions in a popover, filtered against catalog AND excluding anything already chosen (native, third-party, custom — case-insensitive).
  - On Add, normalize whitespace and check case-insensitive duplicates across **all three lists**. If matched, toast "Already in your inventory" instead of adding.

## 4. `inventory_completed` gating + saved state

- `src/components/SenseiChat.tsx`: only attach `nativePlugins / thirdPartyPlugins / customPlugins` to the chat context when `usePluginInventory().isComplete` is true. Edits-in-progress (held only in page state) never leak.
- `src/components/PluginInventoryCard.tsx`: when `isComplete`, show a green "Inventory saved" pill in the card header beside the title.
- `src/pages/PluginInventoryPage.tsx`: track a `dirty` flag (set on any toggle/add/remove relative to the last saved snapshot). While dirty, swap the "Inventory saved" pill for an amber "Unsaved changes" pill so the user sees a clear before/after state until they finish updates. Cleared on successful save.

## Technical details

- Pagination query shape: `supabase.from("user_plugin_inventory").select("user_id, native_plugins, third_party_plugins, custom_plugins, inventory_completed, updated_at", { count: "exact" }).order("updated_at", { ascending: false }).range(page*50, page*50+49)`.
- Prioritized-plugin detection: build a `Set` of lowercased owned names; for each token in the assistant message, do `text.toLowerCase().includes(name)` with word-boundary check for short brand names (e.g. "UAD", "SSL") to avoid false matches.
- Suggestions popover: lightweight inline `<div>` under the input (no Command component needed) to keep bundle and behaviour simple; keyboard Enter still adds the typed value if no suggestion is selected.
- Dirty flag: deep-compare current arrays vs the loaded snapshot using sorted-join (`a.slice().sort().join("|")`).

## Files modified

- `src/pages/AdminPage.tsx` — remove top-level inventory fetch, rewrite `InventoriesTab` with pagination
- `src/components/SenseiChat.tsx` — owned-tools panel, prioritized badges per assistant message, gate context on `isComplete`
- `src/components/PluginInventoryCard.tsx` — "Inventory saved" pill
- `src/pages/PluginInventoryPage.tsx` — dedupe, autocomplete suggestions, dirty/unsaved state
- `src/lib/plugin-inventory-constants.ts` — add `CUSTOM_PLUGIN_SUGGESTIONS`

## Files NOT changed

- No database migration
- No edge function changes
- No new routes
- Auth, admin, paid routes, chain builder, key detection, upload, FL setup all untouched
