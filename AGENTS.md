<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep landscape geometry in a pure, seeded generation module and use instancing/merged meshes for repeated elements to limit draw calls.
- Mount the WebGL experience through a client-only lazy boundary so browser rendering does not run during SSR.
- Resolve Three.js material colors from the global semantic CSS palette so the scene and interface share one design system.
- Open-world detail chunks and coarse horizon share infinite seeded heightAt; contact uses groundAt triangle interpolation and surfaceAt road/runway offsets so rendering and grounding agree.
- Treasure transitions and marker eligibility live in pure adventure-rules, shared by scene, HUD and tests; mutable game state is polled by HUD rather than used as a React memo dependency.
