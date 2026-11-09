# Private content file backup and restore

## What is stored

Programme library documents are stored in the Docker named volume mounted at
`/var/lib/mentormama/content-documents`. They are not served from public
`MEDIA_ROOT`. Database rows reference the files and content revisions may keep
references to earlier uploads. The managed-VPS deployment also stores cover
images and generated exports on this volume set. Downloads and images pass
through authenticated programme-scoped API routes.

## Retention

Keep a file while any current content item or retained revision references it.
Archiving content does not delete its file. There is no automated deletion or
orphan-file purge today; do not remove files manually. Define a retention period
and implement reference-aware deletion before enabling cleanup.

## Backup

Back up PostgreSQL and both the private-content and export directories before
release or migration work. Use the managed-VPS script to produce matched files
and checksums:

```sh
ENV_FILE=.env.production BACKUP_DIR=/var/backups/mentormama \
  scripts/ops/backup-production.sh
```

Copy the database dump, files archive, and checksum file off-host, encrypt them,
and restrict access. Never place backups in a Docker data volume or image.

## Restore

Restore into an isolated environment first. For an approved recovery, stop the
API and worker, take a fresh copy of the current volume, then extract the
selected archive into the existing volume. Preserve ownership and permissions
used by the API container. Restore the matching database backup, start the
services, and verify authenticated scoped downloads for representative current
and revised documents before reopening access.

Do not restore a database and document volume from different points in time
unless the resulting missing or orphaned references have been reviewed.

## Release and rollback

1. Back up the database and private document volume and record checksums.
2. Apply the application release and content migration; keep the volume intact.
3. Verify migration state, upload, authorised download, cross-programme denial,
   and revision behavior in a non-production environment before release.
4. If rollback is needed, stop API/worker, restore the previous application
   image and migration state using the release procedure, and retain the volume.
   The document migration rollback removes database fields but does not remove
   files. Do not purge possible orphans until every current and historical
   reference has been reconciled.
5. If the database must be restored, restore its matching document-volume
   backup, then perform the same access and integrity checks before reopening.

MFA recovery decisions are not rolled back by restoring an authenticator secret.
A correction requires a new audited recovery action. Review audit records and
notification outbox delivery status as part of the release acceptance record.
