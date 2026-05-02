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

# Clean all existing wiki content (except .git and navigation files we'll regenerate)
find "$WIKI_WORKTREE" -mindepth 1 -maxdepth 1 \
  ! -name ".git" \
  -exec rm -rf {} +

# --- Build Home.md ---
{
  echo "# ChordMiniApp Wiki"
  echo
  echo "Published from \`.qoder/repowiki/en/content\`."
  echo
  echo "## Pages"
  echo
} > "$WIKI_WORKTREE/Home.md"

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

  cp "$src" "$WIKI_WORKTREE/$wiki_file"

  # Convert file:// links to GitHub blob URLs.
  # Uses single-quoted Perl regex with shell variable spliced in to avoid
  # double-quote escaping issues that previously broke the substitution.
  perl -0pi -e 's{file://([^\)\s>]+)(\#[^\)\s>]*)?}{'"$SOURCE_BLOB_URL"'/$1$2}g' "$WIKI_WORKTREE/$wiki_file"

  title="${page_name//\// / }"
  slug="${wiki_file%.md}"
  wiki_slug="${slug// /-}"

  # Append to Home.md page list
  echo "- [$title]($WIKI_BASE_URL/$wiki_slug)" >> "$WIKI_WORKTREE/Home.md"

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

git -C "$WIKI_WORKTREE" add .

if git -C "$WIKI_WORKTREE" diff --cached --quiet; then
  echo "No wiki changes to publish."
  exit 0
fi

git -C "$WIKI_WORKTREE" commit -m "$COMMIT_MESSAGE"
git -C "$WIKI_WORKTREE" push

echo "Published wiki to $WIKI_REPO_URL"
