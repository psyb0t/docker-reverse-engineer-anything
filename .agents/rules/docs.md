# Docs

- The documentation site is `docs/`, published by GitHub Pages from `main` at https://psyb0t.github.io/docker-reverse-engineer-anything/ with the Just the Docs theme (`remote_theme` pinned in `docs/_config.yml`, colors in `docs/_sass/`, the shared visitor tracker in `docs/_includes/head_custom.html`). Keep `docs/` flat; a file name is its URL.
- Every page has front matter with a unique `title` and a `description` of 50 to 170 characters, and exactly one `#` heading.
- Links between pages use the relative `.md` path. A link to a file outside `docs/` uses the full `https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/<path>` URL (`tree/main/<path>` for a directory). Wrap code blocks containing `{{` or `{%` in `<!-- {% raw %} -->` and `<!-- {% endraw %} -->`.
- After a docs change, run `make docs` and check the output in `.testing/docs-site` for broken links before handing off.
- The README is the front door: what the image is, the quick start, the modes, and a Documentation section with full site URLs. Reference material (every variable, status code, limit, error message) lives in `docs/`. Each fact has one home. README links use full URLs, because Docker Hub mirrors the README.
- A behavior, setting, limit, error message or command change updates the matching docs page, the skill (`.agents/skills/reverse-engineer-anything/`) and the plugin README in the same change. Error messages in `docs/troubleshooting.md` are copied exactly from `src/`.
- Every `docker run` example keeps the hardening flags listed in `bridge.md`.
- Prose: no em dashes, "directory" never "folder", no AI vocabulary, sentence case headings, one paragraph per source line. Do not mention local scratch directories in committed text.
