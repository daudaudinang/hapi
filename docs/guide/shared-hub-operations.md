# Shared Hub pilot operations

## Deployment boundary

Run exactly one Hub process against one persistent SQLite database. The Shared Hub pilot does not support multiple Hub replicas sharing the database. Place the database and its `-wal`/`-shm` companions on a persistent local volume; do not use a network filesystem.

Stop the Hub before cold restore or database replacement. Keep Keycloak, `AUTH_PEPPER`, organization identity, public URL and callback URL configuration outside the database backup, in the deployment secret store.

## Encrypted backup

Use SQLite's online backup command to create a consistent snapshot while the single Hub instance is running:

```bash
sqlite3 "$HAPI_DB_PATH" ".backup '/secure-staging/hapi.db'"
age -r "$BACKUP_AGE_RECIPIENT" -o "/backups/hapi-$(date +%Y%m%d-%H%M%S).db.age" /secure-staging/hapi.db
rm -f /secure-staging/hapi.db
```

Requirements:

- `/secure-staging` is owner-only (`0700`) and not a shared temporary directory.
- The age private key is stored separately from backups.
- Backup retention and deletion cover encrypted artifacts and staging failures.
- Logs contain only backup identifiers and success/failure, never paths containing user names or secret material.

## Restore drill

Restore into a new path; never overwrite the active database during validation:

```bash
install -d -m 700 /secure-restore
age -d -i "$BACKUP_AGE_IDENTITY" -o /secure-restore/hapi.db "$BACKUP_FILE"
sqlite3 /secure-restore/hapi.db "PRAGMA integrity_check;"
sqlite3 /secure-restore/hapi.db "PRAGMA foreign_key_check;"
```

Both commands must produce `ok`/no foreign-key rows. Then start one isolated Hub instance with the restored database, the same non-database secrets and a non-production listen address. Verify health, Admin login, membership/Team/Runner/grant/audit counts, and one read-only session. Destroy the restored plaintext database after recording the drill result.

## Evidence record

Record date, release SHA, source backup identifier, encryption recipient fingerprint, integrity results, restored entity counts, isolated login result, operator and cleanup confirmation. A documented command without a successful evidence record does not complete the pilot restore gate.

## Manual pilot gates

- Linux: enroll a named profile, install user-systemd service, reboot/login, reconnect, revoke and confirm rejection.
- macOS: enroll a named profile, install LaunchAgent, logout/login, reconnect, revoke and confirm rejection.
- Keycloak: two verified users; direct and Team grants; grant expiry/revoke; Team removal; user disable; existing SSE/terminal closure; offline Runner revoke and rejected reconnect.

Keep these checklist items pending until commands are executed on the target platforms and evidence is attached.
