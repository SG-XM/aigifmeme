# chatgpt2api on Cloudflare Containers

独立 Worker `chatgpt2api`，自定义域 `api.aigifmeme.com`。不修改站点应用、根配置、站点 Worker `aigifmeme` 或现有 D1。不连接 18081。

上游是 `basketikun/chatgpt2api` 标签 `v1.7.0`，Git `1f96b49b2bf35e607a2c587e3fb9d40c5acb475d`，MIT 原文在 `UPSTREAM_LICENSE`。包装镜像的 `FROM` 固定 GHCR linux/amd64 清单：

`ghcr.io/basketikun/chatgpt2api@sha256:fb6bf418e8f281552a756f65df5d10cae1fe29bc9044a5e9326a32923bd225a9`

## 在父环境构建并部署

父环境已有 Docker Engine 29.9.3、buildx 0.38.1，`dockerd` 可跑 `linux/amd64`。构建和 `wrangler containers push` 都在这台机器上完成。不要把 Cloudflare 令牌复制到别的机器或 GitHub Actions。Wrangler 使用这台机器上已经配置好的令牌。

在 `deploy/chatgpt2api` 目录：

```sh
npm ci
npm test
npx wrangler r2 bucket create chatgpt2api-state
umask 077
tmp=$(mktemp)
openssl rand -base64 32 > "$tmp"
printf '%s' "$(cat "$tmp")" | npx wrangler secret put GATE_TOKEN
printf '%s' "$(cat "$tmp")" | npx wrangler secret put UPSTREAM_AUTH_KEY
openssl rand -base64 32 > "$tmp"
printf '%s' "$(cat "$tmp")" | npx wrangler secret put STATE_BRIDGE_SECRET
rm -f "$tmp"
WRITE_IMAGE_PIN=1 sh ops/push-image.sh
npm run deploy
```

`GATE_TOKEN` 和 `UPSTREAM_AUTH_KEY` 使用同一把至少 32 字符的口令，浏览器只需记这一把。`STATE_BRIDGE_SECRET` 是另一把，只放在 Worker 密钥和容器环境里，不要发给浏览器，也不要拿它去创建 R2 S3 访问密钥。状态通过 Worker 的 `STATE_BUCKET` 绑定写入 `chatgpt2api-state`。

`WRITE_IMAGE_PIN=1` 会把推送后的 `registry.cloudflare.com/29a44cf6b1d2c5d00f51960def5bb48d/chatgpt2api@sha256:...` 写进 `image-pin.json` 和 `wrangler.jsonc`。摘要还是 `REPLACE_AFTER_REGISTRY_PUSH` 时，`npm run deploy` 会在 preflight 停下，避免发出没有镜像的 Worker。

上线后：

```sh
curl -sS https://api.aigifmeme.com/health
curl -sS -o /dev/null -w '%{http_code}\n' https://api.aigifmeme.com/v1/models
curl -sS -o /dev/null -w '%{http_code}\n' 'https://api.aigifmeme.com/v1/models?token=ignored'
```

`/health` 的 `probe` 是 `worker`，`model_e2e` 是 false，`persistence` 是 `r2_snapshot`，`snapshot_interval_seconds` 是 15。后两条都是 401。浏览器打开 `https://api.aigifmeme.com/`，在表单里提交口令。地址栏不要出现口令。进入后上游自己的登录页再填同一把口令，仍然只放在表单里。

## 规格

`CONTAINER_INSTANCE` 默认 `basic`：1/4 vCPU、1 GiB 内存、4 GB 磁盘。按 Workers Paid 含 25 GiB-小时计算，这档大约覆盖 25 小时醒着的时间。`standard-1` 是 4 GiB，大约 6.25 小时就用完包含额度。

当前核对结果：

- 限额页把 `basic` 列为正式规格，并说明 `durable_object` 在 `ctx.container.start()` 里选择规格。
- `@cloudflare/workers-types` 5.20261109.1 的 `ContainerStartupOptions.instance` 包含 `basic`。
- 调度策略页的文字仍写运行时不接受 `basic`。自定义规格至少 1 vCPU 且每 vCPU 3 GiB，做不出 1 GiB。

默认发送 `basic`，因为这是类型和限额表里最小的实用档，也比 `lite` 的 256 MiB 更可能跑得起 Python 3.13。如果运行时拒绝这个名字，把 `CONTAINER_INSTANCE` 改成 `lite` 或 `standard-1` 后重新部署。单实例靠 Durable Object 名字 `singleton`。这条策略不能写 `max_instances`。空闲 5 分钟后休眠。

## 持久化

容器磁盘在休眠后清空。不创建 R2 S3 密钥。容器访问 `http://state-bridge.internal`，由 Worker 的 outbound 拦截处理，只用 `STATE_BUCKET` 绑定读写。公网请求这个主机名或 `/_state` 直接 404，不会把请求再转进容器，因此不会自己把容器唤醒。

这不是每次写入都落盘。上游 v1.7.0 的存储接口只覆盖账号和鉴权密钥，配置、日志和图片仍是本地文件；它的后端只有 json、sqlite、postgres 和 git。postgres 不使用。包装对 `config.json` 和 `data/` 做整文件快照：对象都上传成功后才写 manifest，然后才删除旧对象。上传失败时保留上一份成功快照，不启动一个空目录去覆盖远端。正常情况下，上次成功快照之后最多约 15 秒的写入会在崩溃、SIGKILL 或最后一次上传失败时丢掉。SIGTERM 会再尝试一次上传，失败则进程以非零退出。健康检查里的 `r2_snapshot` 只表示这种快照，不表示模型可用，也不表示每一笔写入都已持久化。

首次快照是空号池。种子配置关闭代理、clearance 和上游自带备份。没有账号导入、凭证刷新或绕过。

## 密钥名称

- `GATE_TOKEN`
- `UPSTREAM_AUTH_KEY`
- `STATE_BRIDGE_SECRET`

没有 `R2_ACCESS_KEY_ID` 或 `R2_SECRET_ACCESS_KEY`。
