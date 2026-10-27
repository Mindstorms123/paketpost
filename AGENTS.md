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

- Static build mode (STATIC_BUILD=1, BASE_PATH) yields a pure SPA in dist/client; used by the GitHub Actions workflow for GitHub Pages and the bundled Capacitor APK, so normal Lovable hosting stays unchanged.
- Android app is a Capacitor app bundling the static build; carrier APIs are called on-device via CapacitorHttp with user-supplied keys in localStorage — no relay server, to keep tracking numbers private.
