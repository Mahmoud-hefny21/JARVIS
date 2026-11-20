# Additive future mobile upgrade

No mobile application, remote API, cloud database, sync worker or hosting configuration exists in this version.

Portable records already contain UUIDs, kind, creation/modification timestamps and explicit fields. A future migration can add owner IDs, device IDs, revision counters, tombstones and a transactional outbox without replacing the frontend state/data interface.

Potential user-selected shared boundaries: tasks, reminders, memories, calendar cache and selected conversations. Never synchronize local folder grants, absolute paths, OAuth/provider secrets, source files, local telemetry, or the complete database by default. Credentials remain protected on their owning device.

Future sync needs authenticated account/device pairing, per-owner authorization, expiring sessions, revocation, idempotent mutation IDs, pagination, explicit version conflicts and audited expiring remote commands. These are future requirements, not implemented capabilities. Preserve local operation when any future service is unavailable.

Before selecting Runable or any host, verify runtime support, database durability, backups, limits and pricing from the actual account. Hosting resources and production deployment require user approval. Reminders on a powered-off PC need a separately verified scheduler; remote wake requires supported hardware and a trusted relay.
