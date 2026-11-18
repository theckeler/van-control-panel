#!/usr/bin/env bash
# List each doc's "Last updated" date next to its last git commit date and the
# newest decision date. Flags docs that may have drifted.
# Adapted from the LiteAF workspace (same flags, this repo's file list).
set -euo pipefail
cd "$(dirname "$0")/.."

# Docs older than this many days need a review from Todd before Claude relies on them.
REVIEW_DAYS="${REVIEW_DAYS:-30}"
cutoff=$(date -d "-${REVIEW_DAYS} days" +%F 2>/dev/null || date -v-"${REVIEW_DAYS}"d +%F)

newest_decision=""
if [ -f case-study/decisions.md ]; then
  newest_decision=$(grep -oE '^\| [0-9]{4}-[0-9]{2}-[0-9]{2}' case-study/decisions.md | tr -d '| ' | sort | tail -1 || true)
fi
echo "Newest decision: ${newest_decision:-none} · review threshold: ${REVIEW_DAYS} days (before ${cutoff})"
printf '%-40s %-12s %-12s %s\n' FILE STATED COMMITTED FLAG

for f in README.md CLAUDE.md docs/*.md case-study/README.md case-study/baseline.md; do
  [ -f "$f" ] || continue
  stated=$(grep -m1 -oE '^\*\*Last updated:\*\* [0-9]{4}-[0-9]{2}-[0-9]{2}' "$f" | grep -oE '[0-9-]{10}' || true)
  committed=$(git log -1 --format=%cs -- "$f" 2>/dev/null || true)
  flag=""
  [ -z "$stated" ] && flag="no date"
  if ! git diff --quiet -- "$f" 2>/dev/null; then flag="${flag:+$flag, }uncommitted edits (bump the date?)"; fi
  if [ -z "$committed" ] && [ -n "$(git status --short -- "$f" 2>/dev/null)" ]; then flag="${flag:+$flag, }new, uncommitted"; fi
  [ -n "$stated" ] && [ -n "$committed" ] && [[ "$committed" > "$stated" ]] && flag="${flag:+$flag, }edited after stated date"
  [ -n "$stated" ] && [ -n "$newest_decision" ] && [[ "$newest_decision" > "$stated" ]] && flag="${flag:+$flag, }older than newest decision: review"
  [ -n "$stated" ] && [[ "$stated" < "$cutoff" ]] && flag="${flag:+$flag, }ASK TODD TO REVIEW (over ${REVIEW_DAYS} days old)"
  printf '%-40s %-12s %-12s %s\n' "$f" "${stated:--}" "${committed:--}" "$flag"
done
