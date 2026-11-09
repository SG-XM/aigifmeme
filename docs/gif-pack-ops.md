# GIF pack operations

The site calls only `https://api.aigifmeme.com/v1` (or the admin override) with Bearer auth. It does not import accounts, refresh tokens, or call any other image host.

## Image contract the parent should test once

This matches chatgpt2api v1.7.0 (`1f96b49`), which the deployed wrapper health check identifies. It is not inferred from OpenAI’s edit docs.

`POST /v1/images/generations` was proven for a plain prompt. That handler does not send a reference image. Packs use:

`POST /v1/images/edits`

`Content-Type: application/json`

`Authorization: Bearer <GIF pack API key>`

```json
{
  "model": "gpt-image-2",
  "prompt": "<server-built>",
  "n": 1,
  "size": "1024x1024",
  "quality": "low",
  "response_format": "b64_json",
  "images": [
    {
      "b64_json": "<png bytes, no data: prefix>",
      "mime_type": "image/png",
      "filename": "reference.png"
    }
  ]
}
```

The site reads `data[0].b64_json` and ignores `url` and `revised_prompt`. It does not follow redirects. `n` is always 1. The model field is always `gpt-image-2`. A different admin or env model is rejected and no other model is tried. `/images/generations` is not a fallback.

A live reference edit with this JSON body returned HTTP 200 in 46.203s. The PNG was valid and the subject was preserved. The pixels were 1254×1254, not the requested 1024×1024. The slicer uses the decoded size. Cuts are integer boundaries from `Math.round(index * size / 4)` through the last pixel, so 1254 becomes cells of 314, 313, 314, and 313. A sheet that is not close to square, or a cell under 2 pixels, fails that sticker instead of emitting a bad frame.

Multipart `image` upload is also implemented in that wrapper. This site sends JSON inline bytes so the private image is not fetched back by the wrapper. Remote `image_url` values are not sent.

Reference edits with the JSON body above are proven on the deployed endpoint. A full eight-GIF pack has not been run live. Mock tests are not that pack. Do not send more provider calls until the site flow is deployed.

## Secrets

Do not put the API key in git, `wrangler.jsonc` vars, the frontend, or logs.

Worker secrets, all optional if the same values are saved in admin settings:

| Secret                 | Value                                       |
| ---------------------- | ------------------------------------------- |
| `GIF_PACK_BASE_URL`    | `https://api.aigifmeme.com/v1`              |
| `GIF_PACK_API_KEY`     | bearer token from the owner credential file |
| `GIF_PACK_IMAGE_MODEL` | `gpt-image-2`                               |

`CONFIG_ENCRYPTION_KEY` must stay as it is. Admin saves of `gif_pack_api_key` are encrypted with it. The admin UI returns only a masked preview. Public `/api/config/public` never includes `gif_pack_*`.

Admin fields, which override the worker secrets when set:

| Field                  | Group                          |
| ---------------------- | ------------------------------ |
| `gif_pack_base_url`    | AI → GIF pack provider         |
| `gif_pack_api_key`     | password, encrypted            |
| `gif_pack_image_model` | must be `gpt-image-2` or empty |

An empty admin key does not erase a worker secret. A non-empty admin key replaces it. The base URL must be public HTTPS. Local, link-local, and metadata hosts are rejected.

Apply from the site repo with the key only on stdin:

```sh
sh scripts/gif-pack-config.sh apply /path/to/credential-file
```

Undo:

```sh
sh scripts/gif-pack-config.sh delete
```

The script does not print the key. `delete` removes the three worker secrets. It does not delete an admin database value. Clear that in `/admin/settings` or delete the `gif_pack_api_key` row from `config`.

## Database

Migration `drizzle/0018_gif_pack.sql` adds theme, motion, pack, sticker, file, upload, private blob, and demo tables.

```sh
npx wrangler d1 migrations apply aigifmeme-db --remote
```

Local sqlite:

```sh
pnpm db:push
```

Two themes (daily replies and mood), eight motions each, are inserted on first use. Sixteen demo rows are metadata only: eight dog references times two themes. The GIF and PNG binaries are not in the repo and are not public.

## Deploy

Existing Worker `aigifmeme`, D1 `aigifmeme-db`, and the current R2 settings stay in place. Do not deploy or edit the `chatgpt2api` worker.

R2 is required for phone-sized originals. Without `r2_access_key`, `r2_secret_key`, and `r2_bucket_name`, only small files fit in D1 and generation stops with a storage error. Pack files are stored under `private/gif-packs/` and are downloaded through `/api/gif-packs/:id/files/:fileId` after a session check. The API does not return a public object URL.

```sh
pnpm install --frozen-lockfile
pnpm cf:build
pnpm cf:deploy
```

A minute cron resumes packs whose isolate died. Creating a pack also continues with `waitUntil`, so closing the browser does not cancel the job.

## Product limits

Login is required. One new pack per user per Asia/Shanghai calendar day. Two user-initiated single-sticker regenerations per pack. A failed provider or encode try can run three times and does not use those two. Originals and results stay until the owner or an admin deletes them.

## What is still blocked

Plain text generation and one reference edit are proven. The edit answer was a valid PNG at 1254×1254, with the fixture face kept and a new waving hand. A full eight-GIF pack has not been run. Account-pool state is outside this repo. Do not switch models or call another host.
