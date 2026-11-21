# Wrapper around the published chatgpt2api image.
# tag v2.0.0
# git aad8b4c4ac51cc73d210580298e018c471602581
# index sha256:c5ae8737309ef2245d367eddd4aebdc46e8ae2114ab134c2857bec4ef795920f
# linux/amd64 manifest pinned below. Cloudflare Containers run linux/amd64.
FROM golang:1.24-alpine AS wrapper-build
WORKDIR /wrapper
COPY container/go.mod container/go.sum ./
RUN go mod download
COPY container/*.go ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /entrypoint .

FROM ghcr.io/basketikun/chatgpt2api@sha256:dfa33c149fded5bf65cbbe301f72d1a7bac414691a5df00a7b24a5acad6a5dc0

COPY --from=wrapper-build /entrypoint /opt/cf-wrapper/entrypoint
COPY UPSTREAM_LICENSE /opt/cf-wrapper/UPSTREAM_LICENSE

ENV PORT=80
EXPOSE 80
ENTRYPOINT ["/opt/cf-wrapper/entrypoint"]
