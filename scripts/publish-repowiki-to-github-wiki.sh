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

while IFS= read -r src; do
  rel="${src#"$SOURCE_DIR"/}"
  page_name="${rel%.md}"
  wiki_file="${page_name//\// - }.md"

  copy_wiki_markdown "$src" "$WIKI_WORKTREE/$wiki_file"
done < <(find "$SOURCE_DIR" -type f -name "*.md" | sort)

# --- Write nested sidebar sections ---
python3 - "$SOURCE_DIR" "$WIKI_WORKTREE" <<'PY'
from pathlib import Path
import sys

source_dir = Path(sys.argv[1])
wiki_worktree = Path(sys.argv[2])

md_files = sorted(source_dir.rglob("*.md"))

tree = {'__files__': [], 'subdirs': {}}

for path in md_files:
    rel_path = path.relative_to(source_dir)
    
    # Skip Getting Started as it's already mapped to Home
    if rel_path.name == "Getting Started.md":
        continue
        
    # Walk tree
    current = tree
    for part in rel_path.parts[:-1]:
        if part not in current['subdirs']:
            current['subdirs'][part] = {'__files__': [], 'subdirs': {}}
        current = current['subdirs'][part]
        
    stem = rel_path.stem
    page_name = str(rel_path.with_suffix('')).replace('\\', '/')
    wiki_slug = page_name.replace('/', ' - ').replace(' ', '-')
    
    current['__files__'].append((stem, wiki_slug))

with open(wiki_worktree / "_Sidebar.md", "a") as f:
    # Handle root files explicitly under General
    if tree['__files__']:
        f.write("### General\n\n")
        for fname, slug in sorted(tree['__files__']):
            f.write(f"- [{fname}]({slug})\n")
        f.write("\n")

    def write_tree(node, indent=0, is_root=False):
        # Write subdirectories
        for dname, subnode in sorted(node['subdirs'].items()):
            if is_root:
                f.write(f"### {dname}\n\n")
                write_tree(subnode, indent=0, is_root=False)
                f.write("\n")
            else:
                f.write(f"{'  ' * indent}- **{dname}**\n")
                write_tree(subnode, indent=indent+1, is_root=False)
                
        # Write files
        for fname, slug in sorted(node['__files__']):
            if not is_root:
                f.write(f"{'  ' * indent}- [{fname}]({slug})\n")

    write_tree(tree, indent=0, is_root=True)
PY

rewrite_internal_wiki_links

git -C "$WIKI_WORKTREE" add .

if git -C "$WIKI_WORKTREE" diff --cached --quiet; then
  echo "No wiki changes to publish."
  exit 0
fi

git -C "$WIKI_WORKTREE" commit -m "$COMMIT_MESSAGE"
git -C "$WIKI_WORKTREE" push

echo "Published wiki to $WIKI_REPO_URL"
