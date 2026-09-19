#!/usr/bin/env bash
set -u

cd "$(dirname "$0")" || exit 1
novel_dir="all-books/i-caught-a-pokemon"
log_file="$novel_dir/download.log"
status_file="$novel_dir/download-status.txt"

for attempt in 1 2 3 4 5 6 7 8 9 10; do
    printf 'Pass %s started: %s\n' "$attempt" "$(date -u '+%Y-%m-%d %H:%M:%S UTC')" >> "$log_file"
    if node download-69shuba.js >> "$log_file" 2>&1; then
        count=$(find "$novel_dir/i-caught-a-pokemon_raw" -maxdepth 1 -name 'Chapter *.html' -type f | wc -l | tr -d ' ')
        printf 'Complete: %s chapters saved at %s\n' "$count" "$(date -u '+%Y-%m-%d %H:%M:%S UTC')" | tee "$status_file" >> "$log_file"
        exit 0
    fi
    printf 'Pass %s incomplete; waiting before retry.\n' "$attempt" >> "$log_file"
    sleep 120
done

printf 'Incomplete after 10 passes at %s; inspect download-failures.json and download.log\n' "$(date -u '+%Y-%m-%d %H:%M:%S UTC')" | tee "$status_file" >> "$log_file"
exit 1
