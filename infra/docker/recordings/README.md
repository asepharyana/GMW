# Recordings Directory

This directory is mounted as a volume in the discord-gateway container.
Voice recordings are stored here with the following structure:

```
recordings/
  ├── <user-id>/
  │   ├── <timestamp>.ogg
  │   └── <timestamp>.json
  └── sessions/
      └── <session-id>.json
```

The directory must be writable by UID 1000 (app user in the container).
