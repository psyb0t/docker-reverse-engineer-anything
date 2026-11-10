# Docs

- The documentation site is `docs/`, published by GitHub Pages from `main` at https://psyb0t.github.io/docker-reverse-engineer-anything/ with the Just the Docs theme (`remote_theme` pinned in `docs/_config.yml`, colors in `docs/_sass/`, the shared visitor tracker in `docs/_includes/head_custom.html`). Keep `docs/` flat; a file name is its URL.
- Wrap code blocks containing `{{` or `{%` in `<!-- {% raw %} -->` and `<!-- {% endraw %} -->`.
- After a docs change, run `make docs` and check the output in `.testing/docs-site` for broken links.
- README links use full URLs, because Docker Hub mirrors the README.
- A behavior, setting, limit, error message or command change updates the matching docs page, the skill (`.agents/skills/reverse-engineer-anything/`) and the plugin README in the same change. Error messages in `docs/troubleshooting.md` are copied exactly from `src/`.
- Every `docker run` example keeps the hardening flags listed in `bridge.md`.
