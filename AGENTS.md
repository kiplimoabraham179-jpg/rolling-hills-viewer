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
- Open-world terrain streams as deterministic chunks (src/lib/world-chunks.ts) around the player from the infinite heightAt; collision always uses heightAt so no gaps can exist.
