#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SOURCE_DIR="${SOURCE_DIR:-$REPO_ROOT/.qoder/repowiki/en/content}"
WIKI_REPO_URL="${WIKI_REPO_URL:-https://github.com/ptnghia-j/ChordMiniApp.wiki.git}"
WIKI_BASE_URL="${WIKI_BASE_URL:-https://github.com/ptnghia-j/ChordMiniApp/wiki}"
SOURCE_BLOB_URL="${SOURCE_BLOB_URL:-https://github.com/ptnghia-j/ChordMiniApp/blob/main}"
WIKI_WORKTREE="${WIKI_WORKTREE:-/tmp/ChordMiniApp.wiki}"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-Publish Qoder repowiki docs}"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Source wiki directory not found: $SOURCE_DIR" >&2
  exit 1
fi

if [[ -z "$WIKI_WORKTREE" || "$WIKI_WORKTREE" == "/" || "$WIKI_WORKTREE" == "$REPO_ROOT" ]]; then
  echo "Refusing unsafe wiki worktree path: $WIKI_WORKTREE" >&2
  exit 1
fi

if [[ -d "$WIKI_WORKTREE/.git" ]]; then
  git -C "$WIKI_WORKTREE" pull --ff-only
else
  git clone "$WIKI_REPO_URL" "$WIKI_WORKTREE"
fi

sanitize_wiki_markdown() {
  local file="$1"

  # Qoder emits top-level <cite> reference blocks. GitHub preserves those as
  # raw HTML, so the Markdown links inside render as noisy italic text.
  perl -0pi -e 's{\n?<cite>\s*.*?</cite>\s*\n?}{\n}gs' "$file"

  # Convert remaining file:// source references to GitHub blob URLs.
  perl -0pi -e 's{file://([^\)\s>]+)(\#[^\)\s>]*)?}{'"$SOURCE_BLOB_URL"'/$1$2}g' "$file"

  # Keep pages tidy after removing generated metadata blocks.
  perl -0pi -e 's/\n{3,}/\n\n/g' "$file"
}

rewrite_internal_wiki_links() {
  python3 - "$WIKI_WORKTREE" <<'PY'
from pathlib import Path, PurePosixPath
from urllib.parse import unquote
import re
import sys

root = Path(sys.argv[1])
md_files = sorted(root.glob("*.md"))
slug_set = {path.stem.replace(" ", "-") for path in md_files}
source_rels = {}

for path in md_files:
    if path.name == "Home.md":
        source_rels[path.name] = PurePosixPath("Getting Started.md")
    elif path.name == "_Sidebar.md":
        source_rels[path.name] = PurePosixPath("_Sidebar.md")
    else:
        source_rels[path.name] = PurePosixPath(path.stem.replace(" - ", "/") + ".md")

source_to_slug = {
    str(source_rels[path.name]): path.stem.replace(" ", "-")
    for path in md_files
    if path.name not in {"Home.md", "_Sidebar.md"}
}

link_re = re.compile(r"(\[[^\]]+\]\()([^)]+)(\))")
changed_links = 0


def normalize_posix(path):
    parts = []
    for part in PurePosixPath(path).parts:
        if part in {"", "."}:
            continue
        if part == "..":
            if parts:
                parts.pop()
            continue
        parts.append(part)
    return PurePosixPath(*parts)


for path in md_files:
    source_dir = source_rels[path.name].parent
    text = path.read_text()

    def replacement(match):
        global changed_links

        target = match.group(2).strip()
        if "://" in target or target.startswith(("#", "mailto:")):
            return match.group(0)

        base, separator, fragment = target.partition("#")
        decoded = unquote(base)
        if not decoded.endswith(".md"):
            return match.group(0)

        if decoded.startswith("/"):
            candidate = normalize_posix(decoded.lstrip("/"))
        else:
            candidate = normalize_posix(source_dir / decoded)

        slug = source_to_slug.get(str(candidate))
        if slug not in slug_set:
            return match.group(0)

        new_target = slug + (separator + fragment if separator else "")
        if new_target == target:
            return match.group(0)

        changed_links += 1
        return f"{match.group(1)}{new_target}{match.group(3)}"

    updated = link_re.sub(replacement, text)
    if updated != text:
        path.write_text(updated)

print(f"Rewrote {changed_links} internal wiki links.")
PY
}

copy_wiki_markdown() {
  local src="$1"
  local dest="$2"

  cp "$src" "$dest"
  sanitize_wiki_markdown "$dest"
}

# Clean all existing wiki content (except .git and navigation files we'll regenerate)
find "$WIKI_WORKTREE" -mindepth 1 -maxdepth 1 \
  ! -name ".git" \
  -exec rm -rf {} +

# --- Build Home.md from Getting Started ---
HOME_SOURCE="$SOURCE_DIR/Getting Started.md"
if [[ -f "$HOME_SOURCE" ]]; then
  copy_wiki_markdown "$HOME_SOURCE" "$WIKI_WORKTREE/Home.md"
else
  {
    echo "# ChordMiniApp Wiki"
    echo
    echo "Published from \`.qoder/repowiki/en/content\`."
    echo
    echo "Use the sidebar to browse documentation pages."
  } > "$WIKI_WORKTREE/Home.md"
fi

# --- Build _Sidebar.md header ---
{
  echo "### ChordMiniApp Wiki"
  echo
  echo "- [Home](Home)"
  echo
} > "$WIKI_WORKTREE/_Sidebar.md"

# Temp file to collect sidebar entries as "category\ttitle\tslug" lines
SIDEBAR_ENTRIES=$(mktemp)
trap 'rm -f "$SIDEBAR_ENTRIES"' EXIT

while IFS= read -r src; do
  rel="${src#"$SOURCE_DIR"/}"
  page_name="${rel%.md}"
  wiki_file="${page_name//\// - }.md"

  copy_wiki_markdown "$src" "$WIKI_WORKTREE/$wiki_file"

  title="${page_name//\// / }"
  slug="${wiki_file%.md}"
  wiki_slug="${slug// /-}"

  # Collect sidebar entry: category, title, slug
  top_level="${rel%%/*}"
  if [[ "$top_level" == "$rel" ]]; then
    top_level="General"
  fi
  printf '%s\t%s\t%s\n' "$top_level" "$title" "$wiki_slug" >> "$SIDEBAR_ENTRIES"
done < <(find "$SOURCE_DIR" -type f -name "*.md" | sort)

# --- Write sidebar sections grouped by category ---
current_section=""
sort -t$'\t' -k1,1 "$SIDEBAR_ENTRIES" | while IFS=$'\t' read -r section title slug; do
  if [[ "$section" != "$current_section" ]]; then
    echo "### $section" >> "$WIKI_WORKTREE/_Sidebar.md"
    echo >> "$WIKI_WORKTREE/_Sidebar.md"
    current_section="$section"
  fi
  echo "- [$title]($slug)" >> "$WIKI_WORKTREE/_Sidebar.md"
done
echo >> "$WIKI_WORKTREE/_Sidebar.md"

rewrite_internal_wiki_links

git -C "$WIKI_WORKTREE" add .

if git -C "$WIKI_WORKTREE" diff --cached --quiet; then
  echo "No wiki changes to publish."
  exit 0
fi

git -C "$WIKI_WORKTREE" commit -m "$COMMIT_MESSAGE"
git -C "$WIKI_WORKTREE" push

echo "Published wiki to $WIKI_REPO_URL"
