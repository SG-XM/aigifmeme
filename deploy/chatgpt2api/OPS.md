# chatgpt2api on Cloudflare Containers

独立 Worker `chatgpt2api`，自定义域 `api.aigifmeme.com`。不修改站点应用、根配置、站点 Worker `aigifmeme` 或现有 D1。不连接 18081。

上游是 `basketikun/chatgpt2api` 标签 `v2.0.0`，Git `aad8b4c4ac51cc73d210580298e018c471602581`，MIT 原文在 `UPSTREAM_LICENSE`。包装镜像的 `FROM` 固定 GHCR linux/amd64 清单：

`ghcr.io/basketikun/chatgpt2api@sha256:dfa33c149fded5bf65cbbe301f72d1a7bac414691a5df00a7b24a5acad6a5dc0`

## 构建并部署

不要把 Cloudflare 令牌复制到别的机器或 GitHub Actions。构建和推送使用当前环境里的 `CLOUDFLARE_API_TOKEN`。`ops/push-image.sh` 会优先使用本机 Docker；如果没有 Docker 守护进程，则使用 `ops/oci-push`（Go `go-containerregistry`）直接编译静态 Go 包装器并推送到 Cloudflare 容器仓库。

在 `deploy/chatgpt2api` 目录：

```sh
npm ci
npm test
WRITE_IMAGE_PIN=1 sh ops/push-image.sh
npm run deploy
```

`GATE_TOKEN` 和 `UPSTREAM_AUTH_KEY` 使用同一把至少 32 字符的口令，浏览器只需记这一把。`STATE_BRIDGE_SECRET` 是另一把，只放在 Worker 密钥和容器环境里，不要发给浏览器，也不要拿它去创建 R2 S3 访问密钥。状态通过 Worker 的 `STATE_BUCKET` 绑定写入 `chatgpt2api-state`。

`WRITE_IMAGE_PIN=1` 会把推送后的 `registry.cloudflare.com/29a44cf6b1d2c5d00f51960def5bb48d/chatgpt2api@sha256:...` 写进 `image-pin.json` 和 `wrangler.jsonc`。

## 持久化（v2.0.0 Go + SQLite WAL）

容器磁盘在休眠后清空。容器访问 `http://state-bridge.internal`，由 Worker 的 outbound 拦截处理，只用 `STATE_BUCKET` 绑定读写。公网请求这个主机名或 `/_state` 直接 404，不会唤醒容器。

上游 v2.0.0 基于 Go，使用 `config.yaml` 与 `data/chatgpt2api.db`（SQLite WAL 模式）及 `data/images/`。Go 包装器 `container/` 每 15 秒及收到 `SIGTERM` 时先通知主进程退出再做最终快照：

- 对 `data/chatgpt2api.db` 使用 `VACUUM INTO` 生成一致性单文件快照，避免 WAL 不一致。
- 仅在所有对象上传成功后才写入 `state/_manifest.json`，然后再清理旧对象。
- 恢复时若发现旧版 v1.7.0 清单，会保留原有 R2 备份并重新初始化 v2.0.0 状态；若单对象摘要不一致，会记录告警并优先使用线上实际对象继续启动，而不是拒绝启动。

## 密钥名称

- `GATE_TOKEN`
- `UPSTREAM_AUTH_KEY`
- `STATE_BRIDGE_SECRET`
