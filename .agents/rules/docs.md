# Docs

- The documentation site is `docs/`, published by GitHub Pages from `main` at https://psyb0t.github.io/docker-reverse-engineer-anything/. Docusaurus builds it from `website/` (config, sidebar order in `sidebars.mjs`, theme CSS, the shared visitor tracker script). Keep `docs/` flat; a file name is its URL. A new page also goes into `website/sidebars.mjs` and `website/static/llms.txt`.
- After a docs change, run `make docs`. The build fails on a broken link or heading anchor.
- README links use full URLs, because Docker Hub mirrors the README.
- A behavior, setting, limit, error message or command change updates the matching docs page, the skill (`.agents/skills/reverse-engineer-anything/`) and the plugin README in the same change. Error messages in `docs/troubleshooting.md` are copied exactly from `src/`.
- Every `docker run` example keeps the hardening flags listed in `bridge.md`.
