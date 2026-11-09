# Wrapper around the published chatgpt2api image.
# tag v1.7.0
# git 1f96b49b2bf35e607a2c587e3fb9d40c5acb475d
# index sha256:e696efc15f4554b5d4fd75f0d06c3441b6b97ae11f64bf04ca86d39d33df14d5
# linux/amd64 manifest pinned below. Cloudflare Containers run linux/amd64.
FROM ghcr.io/basketikun/chatgpt2api@sha256:fb6bf418e8f281552a756f65df5d10cae1fe29bc9044a5e9326a32923bd225a9

COPY container/r2sync.py /opt/cf-wrapper/r2sync.py
COPY container/entrypoint.py /opt/cf-wrapper/entrypoint.py
COPY UPSTREAM_LICENSE /opt/cf-wrapper/UPSTREAM_LICENSE

ENV STORAGE_BACKEND=json \
    PYTHONUNBUFFERED=1

EXPOSE 80
ENTRYPOINT ["python", "-u", "/opt/cf-wrapper/entrypoint.py"]
