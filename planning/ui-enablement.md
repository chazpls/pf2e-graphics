[65 tools called]

### What “turn the UI back on” actually means here

- Every UI surface was deliberately short‑circuited in `src/index.ts` and `src/view/index.ts`, so nothing registers hooks, sidebars, or tours right now. (`SvelteApplication`, `setupSidebar`, `registerTours`, etc. are all commented out.)  
  ```1:64:src/index.ts
  // import { SvelteApplication } ... // registerTours(); // DISABLED
  ```
  ```1:9:src/view/index.ts
  // import './AnimationSidebar';  // DISABLED - UI not compatible with v13 yet
  ```

- Running `pnpm check` already fails before re‑enabling anything. The current errors fall into four buckets that all have to be cleared before we can safely uncomment the UI:

  1. **Tooling / config gaps** – Svelte 4 now hard‑requires `verbatimModuleSyntax: true`, but `tsconfig.json` still sets it to `false`, which causes most of the downstream Svelte warnings (`slide`, `MultiSelect`, `dev`, etc.) to appear even though the imports exist.  
     ```4:42:tsconfig.json
     "verbatimModuleSyntax": false,
     ```
     Fix: flip this to `true`, rerun `pnpm check`, and confirm the spurious “not defined” warnings disappear.

  2. **Missing globals** – our `Window` augmentation only exposes `pf2eGraphics`, but all of the UI code dereferences `window.game`, `window.ui`, `window.canvas`, etc. (`Pick.svelte`, `AnimationSidebar`, history shell, etc.)  
     ```73:79:src/extensions.d.ts
     interface Window {
     	saveDataToFile;
     	CanvasAnimation;
     	ImagePopout;
     	TextureTransitionFilter: typeof TextureTransitionFilter;
     	pf2eGraphics: pf2eGraphics;
     }
     ```
     Add the PF2e‐specific globals (e.g., `game: GamePF2e`, `ui: UiPF2e`, `canvas: CanvasPF2e`, `Sequencer`, `CONST`, etc.) to `Window` so the dozens of `Property 'game' does not exist on type 'Window'` errors go away. Where Foundry 13 moved types out of the global namespace (e.g., `Tour`, `SidebarTour`, `InteractionLayer`), import them from the generated type files (`foundry/client/nue/tour.mjs`, `foundry/client/canvas/layers.mjs`) instead of assuming globals.

  3. **PF2e / Foundry API changes** – several runtime types changed in v13 and PF2e 6+, and the TypeScript errors are telling us exactly where:
     - `Token`/`MeasuredTemplate`/`Point` are no longer globals, so `src/payloads/index.ts`, `src/storage/AnimCore.ts`, and `src/payloads/graphic.ts` need explicit imports (e.g., `import type { TokenPF2e } from 'foundry-pf2e'; import type { Point } from 'pixi.js';`).  
       ```100:166:src/payloads/index.ts
       if (doc instanceof TokenDocument || doc instanceof Token) { ... }
       ```
       ```195:233:src/storage/AnimCore.ts
       targets?: (TokenOrDoc | string | Point)[];
       ```
     - `TokenPF2e` no longer exposes `getSize()` on the placeable; use `placeable.document.getSize()` or the new `bounds` helpers when calculating relative sizes in `payloads/graphic.ts`.  
       ```268:367:src/payloads/graphic.ts
       const tokenSize = placeable.getSize();
       ```
     - `TokenConfigPF2e` is not generic in v13, so the slider component should accept the concrete class, and it needs to import `i18n` (the current warnings show the binding is missing).  
       ```1:38:src/view/TokenConfigEffectiveSize/Slider.svelte
       export let document: TokenConfigPF2e<TokenDocumentPF2e>;
       ```
     - Sequencer’s type definitions don’t cover the custom option objects we’re passing (`Vector2` mismatches, `AnimationRotateTowardsOptions` lacking `duration`). For each failing call (`rotateTowards`, `attachTo`, `size`, etc.) either:
       - narrow the object to the signature Sequencer actually exports, or
       - define local interfaces (e.g., `interface RotateTowardsOptions extends Parameters<Sequence['rotateTowards']>[1] { duration?: number; ease?: string; }`) and use those types instead of the upstream ones.

     - `triggers/chatMessage.ts` relies on Toolbelt flags with `any` types; add explicit interfaces for the flag schema so `toolbeltTargets`’s lambda parameter is typed and `target.object` type‑guards are valid.  
       ```44:117:src/triggers/chatMessage.ts
       const toolbeltTargets = message.flags?.['pf2e-toolbelt']?.targetHelper?.targets?.map(
       	t => fromUuidSync(t) as TokenDocumentPF2e | null,
       );
       ```

     - Tours now live in Foundry’s “nue” namespace; import `Tour`, `TourConfig`, and `SidebarTour` instead of assuming they are globals, and extend the right base class so `override` is legal.  
       ```31:94:src/tours/index.ts
       class GrandUnifiedTour extends SidebarTour {
       	override get canStart() { ... }
       }
       ```
       ```6:40:src/tours/seriousTourConfigs.ts
       export function generateSeriousTourConfigs(...): TourConfig[] {
       ```

     - `AnimationDocumentApp` references the global `Application` constant for `_state` checks. Foundry 13 moved `Application.RENDER_STATES` onto `foundry.applications.api.ApplicationV2`. Either import that symbol or gate the check through `globalThis.foundry.applications.api.Application` so TypeScript knows it exists.  
       ```34:119:src/view/AnimationDocument/AnimationDocumentApp.ts
       app._state > Application.RENDER_STATES.CLOSED;
       ```

  4. **Svelte component hygiene** – once `verbatimModuleSyntax` is corrected, re‑run `pnpm check` and clean up any remaining real warnings (e.g., `JSONEditor.svelte` needs `dev` imported from `src/utils`, `AnimationDocument/execute/Graphic.svelte` and others must import the `_components` they render, `LiveCrosshairPicker/Pick.svelte` should use the globally declared `game`). Any leftovers after the config change will be genuine missing imports.

### After the types are satisfied

1. Upgrade to the latest `@typhonjs-fvtt/runtime`/`standard` that supports Foundry v13 AppV2. The current `0.3.0-next.x` build (`node_modules/@typhonjs-fvtt/runtime/_dist/svelte/application/index.d.ts`) still extends `foundry.appv1.api.Application`, so even if the types compile you’ll be stuck on the legacy Application implementation. Pull in the release that targets Foundry’s AppV2 and re‑enable the “TJS SHIM” block in `src/index.ts` so the default options get patched for Foundry 13.

2. Re‑enable the UI hooks:
   - uncomment the imports and calls for `setupSidebar`, `registerTours`, and every module in `src/view/index.ts` (`AnimationSidebar`, `AnimationHistory`, `VolumeControls`, etc.).
   - make sure `setupSidebar()` still works with the Foundry 13 sidebar rework; `@typhonjs-fvtt/standard`’s `FVTTSidebarControl` handles AppV2 but may need its CSS selectors updated.

3. Restore the tours once the type fixes are in place and `game.tours.register` accepts the new class.

4. Run `pnpm check` → `pnpm run build` → launch Foundry v13 with `pnpm dev` (`vite` server) and walk through:
   - opening the Animation Sidebar tab,
   - editing a document (ensure `AnimationDocumentApp` renders, saves, and respects read‑only),
   - spawning the history app,
   - attaching the chat message widgets.

5. **Runtime testing and regression fixes** – This is the "actually run it and see what breaks" step. Even after everything compiles (`pnpm check` passes), you need to:
   - Launch Foundry v13 with the module loaded (`pnpm dev`)
   - Open the browser devtools console to catch runtime errors
   - Test each UI feature manually:
     * Click the sidebar tab - does it open? Does it render correctly?
     * Open an animation document - does the editor appear? Can you save?
     * Try the history app - does it spawn? Does it position correctly?
     * Check chat message widgets - do they attach properly?
   - Look for issues that only show up at runtime:
     * **Window positioning** - TyphonJS windows might position incorrectly with Foundry 13's new layout system
     * **CSS conflicts** - Your module's CSS might clash with Foundry 13's new sidebar/UI shell
     * **AppV2 warnings** - Foundry might log warnings if TyphonJS isn't fully compatible with AppV2
     * **Event handlers** - Some Foundry hooks/events might have changed signatures
     * **DOM selectors** - CSS selectors targeting Foundry's UI might break if Foundry changed class names
   - Fix each issue as you find it, then test again
   - This is iterative - you'll likely find 2-3 rounds of issues before everything works smoothly

### Current Status (after addressing items 1-4)

✅ **Completed:**
- `verbatimModuleSyntax` set to `true` in `tsconfig.json`
- Foundry v13 globals added to `extensions.d.ts` (`game`, `ui`, `canvas`, `Tour`, etc.)
- Most type errors addressed

⚠️ **Remaining type errors:**
- Some errors in `foundry-pf2e`'s own type definitions (in `node_modules` - can't fix, but may be ignorable with `skipLibCheck: true`)
- `TourNag.svelte` has a `declare` statement issue (line 12) - needs to be moved to `<script context="module">` or use global types differently

📋 **What's left to do:**

1. **Fix remaining type errors** (if any are blocking):
   - Fix `TourNag.svelte` declare statement
   - Decide if `foundry-pf2e` type errors are blocking (they're in dependencies, not your code)

2. **Upgrade TyphonJS** (Step 1 from "After the types are satisfied"):
   - Check if `@typhonjs-fvtt/runtime@^0.3.0-next.2` has AppV2 support yet
   - If not, find the version that does (or wait for release)
   - Current version extends `foundry.appv1.api.Application` - need one that extends AppV2

3. **Re-enable UI** (Steps 2-3):
   - Uncomment imports in `src/index.ts` and `src/view/index.ts`
   - Uncomment the TJS SHIM block in `src/index.ts`
   - Uncomment `setupSidebar()` and `registerTours()` calls

4. **Build and test** (Step 4):
   - Run `pnpm check` to ensure no blocking errors
   - Run `pnpm run build`
   - Launch Foundry and test each UI feature

5. **Runtime regression fixes** (Step 5 - explained above):
   - Actually run the module in Foundry
   - Test each feature manually
   - Fix runtime issues as they appear
   - Iterate until everything works

### TL;DR

Getting the UI back means more than uncommenting a couple of imports: we have to (a) satisfy the current pile of Svelte/TS errors, (b) modernize our type declarations for Foundry 13 / PF2e 6, (c) upgrade TyphonJS so `SvelteApplication` works on AppV2, and then (d) re‑enable the sidebar, editor, tours, and chat components. Once those steps are done and `pnpm check` is green, we can safely reintroduce the UI without breaking the rest of the module.

**Step 5 specifically** is about runtime testing - even after everything compiles, you need to actually run the module in Foundry v13 and fix issues that only appear when the code executes (CSS conflicts, positioning bugs, API changes, etc.). It's the "does it actually work?" validation step.