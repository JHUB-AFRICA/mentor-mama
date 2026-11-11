#!/bin/sh
# Start as root, make the persistent-disk folders writable for the app user, then run the command as that user.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p /var/lib/mentormama/content-documents /var/lib/mentormama/exports /var/lib/mentormama/beat
  chown -R 10001:10001 /var/lib/mentormama
  exec setpriv --reuid=10001 --regid=10001 --clear-groups "$@"
fi
exec "$@"
