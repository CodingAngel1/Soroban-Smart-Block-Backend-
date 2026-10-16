#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <source-postgresql-url> <empty-restore-postgresql-url>" >&2
  exit 2
fi

source_url=$1
restore_url=$2

if [[ $source_url != postgres://* && $source_url != postgresql://* ]]; then
  echo "Source must be a PostgreSQL URL." >&2
  exit 2
fi

if [[ $restore_url != postgres://* && $restore_url != postgresql://* ]]; then
  echo "Restore target must be a PostgreSQL URL." >&2
  exit 2
fi

if [[ $source_url == "$restore_url" ]]; then
  echo "Source and restore target must be different databases." >&2
  exit 2
fi

for command_name in pg_dump pg_restore psql; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required PostgreSQL client not found: $command_name" >&2
    exit 127
  fi
done

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
dump_file="$work_dir/backup.dump"

echo "Creating custom-format PostgreSQL backup."
pg_dump --format=custom --no-owner --no-privileges --file="$dump_file" "$source_url"

echo "Validating backup archive."
pg_restore --list "$dump_file" >/dev/null

echo "Restoring backup into the isolated target database."
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$restore_url" "$dump_file"

echo "Checking restored database connectivity."
psql "$restore_url" --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align --command='SELECT 1'

echo "PostgreSQL backup-restore drill passed."
