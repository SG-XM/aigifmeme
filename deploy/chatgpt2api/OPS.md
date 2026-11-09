# chatgpt2api on Cloudflare Containers

独立 Worker `chatgpt2api`，自定义域 `api.aigifmeme.com`。不修改站点 Worker `aigifmeme`、站点 `wrangler.jsonc`、D1，也不连接现有的 18081 服务。

上游是 `basketikun/chatgpt2api` 标签 `v1.7.0`，Git `1f96b49b2bf35e607a2c587e3fb9d40c5acb475d`，MIT 许可证原文在 `UPSTREAM_LICENSE`。包装镜像的 `FROM` 固定 GHCR linux/amd64 清单：

`ghcr.io/basketikun/chatgpt2api@sha256:fb6bf418e8f281552a756f65df5d10cae1fe29bc9044a5e9326a32923bd225a9`

多架构索引摘要是 `sha256:e696efc15f4554b5d4fd75f0d06c3441b6b97ae11f64bf04ca86d39d33df14d5`。OCI 标签 `org.opencontainers.image.version=1.7.0`，`org.opencontainers.image.revision` 与上面的 Git 修订一致。

## 没有本机 Docker 时能不能部署

不能在这台没有 Docker 的机器上完成第一次部署。Cloudflare 没有远程 Dockerfile 构建。`wrangler deploy` 只有在 `image` 指向 Dockerfile 时才会构建，而且它调用本机 Docker。`durable_object` 调度策略只接受 Cloudflare 托管仓库里的摘要引用，不能直接填写 `ghcr.io`。`default` 策略可以拉取 Docker Hub、Amazon ECR 和 Google Artifact Registry，不包含 GHCR，而且该策略已标记为弃用，创建后不能改。

因此部署分成两段：

1. 在有 Docker 的构建机上构建这层薄包装并推到 `registry.cloudflare.com/29a44cf6b1d2c5d00f51960def5bb48d/chatgpt2api`。GitHub Actions 的 `ubuntu-latest` 可以做这件事，模板在 `ops/github-image-build.yml`。
2. 把推送得到的 `registry.cloudflare.com/...@sha256:...` 写入 `image-pin.json` 和 `wrangler.jsonc` 之后，在父环境执行 `npm run deploy`。这一步不再需要 Docker。

在摘要还是 `REPLACE_AFTER_REGISTRY_PUSH` 时，`npm run deploy` 会在 preflight 失败，避免先发出一个没有镜像的 Worker。

## 资源

账号 `29a44cf6b1d2c5d00f51960def5bb48d`。区域 `aigifmeme.com` 已在该账号。`api.aigifmeme.com` 目前没有 DNS；`custom_domain: true` 会在部署时创建记录和证书。不要给这个 Worker 加 `aigifmeme.com` 或 `www` 路由。

| 资源 | 名称 |
| --- | --- |
| Worker | `chatgpt2api` |
| Container 应用 | `chatgpt2api-runtime` |
| Durable Object | `Chatgpt2ApiContainer`，SQLite，只使用实例名 `singleton`。`durable_object` 配置不能写 `max_instances`，单实例靠这一个名字保证 |
| 自定义域 | `api.aigifmeme.com` |
| workers.dev | 开启，和自定义域使用同一套鉴权 |
| R2 桶 | `chatgpt2api-state`，绑定 `STATE_BUCKET` |
| 实例规格 | `standard-1`（1/2 vCPU，4 GiB 内存，8 GB 磁盘） |
| 空闲休眠 | `sleepAfter = 5m` |

`durable_object` 运行时接受 `lite`、`standard-1`、`standard-2`、`standard-3`、`standard-4`。`basic`（1 GiB）只能写在已弃用的 `default` 策略里，这里选不了。`lite` 只有 256 MiB，而镜像是 Python 3.13 加上完整的 uvicorn 应用，不适合作为默规格。`standard-1` 是这条策略上最小的实用规格。需要改规格时只改变量 `CONTAINER_INSTANCE`，允许的值就是上面五个名字。

Workers Paid 含 25 GiB-小时内存。`standard-1` 按配置的 4 GiB 计，大约 6.25 小时醒着的时间会用完包含额度。磁盘包含额度是 200 GB-小时，这档磁盘是 8 GB。休眠之后不计容器运行费用。空闲必须能睡下去，不要把休眠改成很长。

账单读取接口返回 403 不影响创建 Worker、DNS 和 R2，只要令牌本身有对应写权限。

## 密钥名称

只通过 `wrangler secret put` 或 `.dev.vars` 提供。不要写进 Git，也不要打进镜像。

- `GATE_TOKEN`：Worker 门禁。浏览器表单和 `Authorization: Bearer` 都认它。
- `UPSTREAM_AUTH_KEY`：传给容器的 `CHATGPT2API_AUTH_KEY`。建议和 `GATE_TOKEN` 使用同一把新生成的值，这样应用自己的登录页可以填同一口令。
- `R2_ACCESS_KEY_ID`：只授权 `chatgpt2api-state` 对象读写的 R2 S3 访问密钥。
- `R2_SECRET_ACCESS_KEY`：上面那把密钥的 secret。

生成示例（不要把输出写进仓库或聊天记录）：

```sh
openssl rand -base64 32
```

把同一个值分别粘贴进 `GATE_TOKEN` 和 `UPSTREAM_AUTH_KEY`。两把口令都必须不少于 32 个字符，短口令会被当成未配置，请求返回 503，容器不会启动。R2 的两把密钥在 Cloudflare 仪表盘创建，范围只限这个新桶。

查询参数里的 `token`、`auth`、`api_key` 之类不会被当成登录，转发前也会删掉。浏览器登录是 `POST /_gate/login` 的表单，Cookie 是 `HttpOnly`。

公开的只有 `GET/HEAD /health` 和 `/healthz`。它们由 Worker 直接回答，不启动容器，也不看账号池。响应里的 `model_e2e` 固定为 `false`，`accounts` 为 `not_checked`。上游自己的 `/health` 会带账号统计，被这层门禁挡住，不会公开。

未配置密钥时，鉴权失败返回 401，配置不完整返回 503，两种情况都不会调用容器。

## 持久化

容器磁盘在休眠后清空。FUSE 挂载 R2 是文档支持的做法，但文档写明它不是 POSIX 磁盘。上游 JSON 存储用整文件覆盖写 `config.json`、`data/accounts.json` 和 `data/auth_keys.json`。包装在启动前从 R2 拉回这些文件，运行中每 15 秒以及收到 `SIGTERM` 时把完整文件上传回去。对象前缀是 `state/`。超过 64 MiB 的单文件会跳过并记一条不含内容的日志。

`SIGKILL` 或进程在两次同步之间崩溃，会丢掉最后不到一个同步间隔里的写入。休眠走的是 `SIGTERM`，入口脚本会先刷盘。

首次启动如果桶是空的，会写入一份种子配置：账号文件不预置，`auth-key` 留空（实际口令只来自环境变量），代理和 clearance 关闭，上游自带的 R2 备份关闭。这样不会把访问密钥再写进应用配置，也不会启用 FlareSolverr。号池保持为空。包装没有实现账号导入、凭证刷新或绕过。

健康检查通过，只说明 Worker 门禁活着。它不是模型调用成功。空号池时模型请求会由上游返回错误，这不在本次验证范围内。

## 构建机

在仓库的 `deploy/chatgpt2api` 目录：

```sh
npm ci
npm test
export CLOUDFLARE_API_TOKEN=...   # 已有的 Workers 令牌，不要打印
export CLOUDFLARE_ACCOUNT_ID=29a44cf6b1d2c5d00f51960def5bb48d
WRITE_IMAGE_PIN=1 sh ops/push-image.sh
```

脚本发现没有 `docker` 会直接退出。推送后的摘要要出现在 `image-pin.json` 的 `cloudflare_image` 和 `wrangler.jsonc` 的 `images.base.image`。`WRITE_IMAGE_PIN=1` 会替你改这两个文件。

也可以把 `ops/github-image-build.yml` 复制到仓库的 `.github/workflows/chatgpt2api-image.yml`，在 GitHub Actions secret 里放 `CLOUDFLARE_API_TOKEN`，再手动运行 workflow。Runner 自带 Docker。

## 父环境部署

构建机已经写入真实摘要之后，在这台没有 Docker 的机器上：

```sh
cd deploy/chatgpt2api
npm ci
npx wrangler r2 bucket create chatgpt2api-state
printf '%s' "$GATE_TOKEN" | npx wrangler secret put GATE_TOKEN
printf '%s' "$UPSTREAM_AUTH_KEY" | npx wrangler secret put UPSTREAM_AUTH_KEY
printf '%s' "$R2_ACCESS_KEY_ID" | npx wrangler secret put R2_ACCESS_KEY_ID
printf '%s' "$R2_SECRET_ACCESS_KEY" | npx wrangler secret put R2_SECRET_ACCESS_KEY
npm run deploy
```

部署命令是 `npm run deploy`，它会先跑 preflight。不要对这份配置执行会构建 Dockerfile 的 `wrangler deploy`，那会要求本机 Docker。

上线后核对：

```sh
curl -sS https://api.aigifmeme.com/health
curl -sS -o /dev/null -w '%{http_code}\n' https://api.aigifmeme.com/v1/models
curl -sS -o /dev/null -w '%{http_code}\n' "https://api.aigifmeme.com/v1/models?token=ignored"
```

`/health` 应返回 `"probe":"worker"` 且 `model_e2e` 为 false。后两条应是 401。带 `Authorization: Bearer` 的请求才会启动容器。浏览器打开 `https://api.aigifmeme.com/` 应先看到表单，口令不要出现在地址栏。

`workers.dev` 主机同样要先过门禁。不需要为它单独放行。
