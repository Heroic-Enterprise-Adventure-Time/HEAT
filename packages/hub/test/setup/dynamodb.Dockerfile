# The DynamoDB Local image the hub's tests start (test/setup/dynamodb.ts),
# by exact version and digest (docs/standards/typescript.md, rule 33).
# Nothing builds this file: it is here so that Dependabot's docker ecosystem
# moves the version and the digest together. The digest is the image index
# Docker Hub lists for 3.3.2, read 2026-11-27.
FROM amazon/dynamodb-local:3.3.2@sha256:6ada631ec7aa5fc83446855eb17233e3dad184fec47477e8140c6c569cfe0c86
