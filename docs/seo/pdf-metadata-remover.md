# PDF Metadata Remover：页面与关键词记录

日期：2026-11-03。目标路由：`/pdf-metadata-remover`，同步提供 `/zh`、`/es`、`/ar` 版本。

## 用户需求与页面设计

用户已选择 PDF 专用工具内页，并要求长尾关键词、FAQ 和专属插图。本页提供可直接使用的 PDF 检测、清理、重新检测和下载，不以文章替代工具。保持本站米白底、深绿按钮、深色正文；PDF 页标题桌面最大 48px、手机 32px，不修改首页字号。

页面顺序：面包屑 → 标题与直接答案／概念插画 → PDF 专用工具 → 页内导航 → 三步流程图 → 字段范围表与边界说明 → 结果验证 → 使用场景 → 12 条 FAQ → 全格式工具内链 → 来源／团队／真实更新日期。

上传入口限定 PDF，单个输入上限 10,000,000 字节。复用现有处理引擎，保持用户文件在浏览器内处理，不增加清理 API、登录或收费步骤。

## 调研方法与证据强度

执行了英文搜索，检查了竞品 PDF 页面、公开用户提问与 Adobe 官方说明，并查询 Google Trends。不是 Google Search Console 数据，也不是付费关键词工具的搜索量报告；不编造月搜索量、关键词难度、Google PAA 或排名。

Google Trends：Worldwide，`today 12-m`，主题查询 `pdf metadata`，2026-11-03 取得的 top related queries：

| 原始相关查询        | 相对指数 |
| ------------------- | -------: |
| remove metadata     |      100 |
| remove pdf metadata |       98 |
| change pdf metadata |       80 |
| check pdf metadata  |       41 |
| view pdf metadata   |       37 |
| pdf metadata editor |       31 |
| metadata viewer     |       17 |
| pdf metadata viewer |       17 |
| metadata remover    |       14 |

这些指数仅用于比较本次相关查询的相对热度，不能换算成月搜索量。`change`／`editor` 意图涉及编辑，现有产品只清理，因此不宣传可修改字段。

实际搜索 query：

- `remove metadata from pdf online author title XMP no upload`
- `remove pdf metadata without adobe acrobat author date reddit`
- `PDF metadata removal does not remove comments hidden information digital signatures`
- `remove pdf metadata online free without uploading XMP author`
- `site.helpx.adobe.com acrobat PDF properties metadata remove hidden information`
- `site.exiftool.org PDF metadata reversible qpdf linearize`

ChatGPT 网站检查：可打开匿名入口，但未完成提问和答案／引用采集。因此本记录不声称完成 ChatGPT 推荐或引用测试；页面角度由搜索证据、官方资料和项目实际功能确定。

## 关键词与页面映射

主词保持 `PDF Metadata Remover`，以工具／执行意图为主，不再建同义词重复页。

| 长尾词／用户问题                                     | 意图       | 页面落点与回答                                            |
| ---------------------------------------------------- | ---------- | --------------------------------------------------------- |
| remove PDF metadata online free                      | 直接使用   | 首屏、描述、FAQ 1：免费，无需账号，本地处理               |
| remove metadata from PDF without uploading           | 隐私条件   | 首屏、FAQ 7：选中文件字节不发送至清理服务器               |
| remove author name from PDF                          | 单字段任务 | 范围表、FAQ 2：Info 作者和文档级 XMP；正文／批注姓名另算  |
| remove XMP metadata from PDF                         | 技术范围   | 范围表、FAQ 3：目录级 XMP 数据包；非所有内嵌对象          |
| remove PDF creation date and modified date           | 日期任务   | FAQ 4：嵌入日期与操作系统文件时间的区别                   |
| remove PDF metadata without losing quality           | 输出质量   | FAQ 5：不主动修改页面、不栅格化、不主动重压图片；仍需复查 |
| remove PDF metadata without Acrobat on Mac / Windows | 平台／安装 | FAQ 6：现代浏览器直接处理                                 |
| check / view PDF metadata                            | 检查与验证 | 工具先列属性，验证段说明重新选择下载副本                  |
| PDF metadata still showing after removal             | 排错       | FAQ 10：编辑／导出重新写入，另查批注、图片、文件系统属性  |
| remove PDF metadata for anonymous submission         | 场景       | 使用场景、FAQ 11：明确不能承诺全文件匿名化                |
| password protected / digitally signed PDF            | 兼容性     | FAQ 8：加密不支持，重写可能破坏数字签名                   |
| bulk remove PDF metadata                             | 批量需求   | FAQ 12：如实说明一次一个文件，不宣传未实现能力            |

公开用户问题依据包括：

- https://www.reddit.com/r/pdf/comments/1qlgf75/pdf_metadata/ （文档作者、日期、无需上传／Adobe）
- https://www.reddit.com/r/pdf/comments/10sreug/ （PDF 日期与文件系统时间）

这些讨论仅用于识别问题，不作为产品能力或 PDF 技术结论的权威来源。

## 官方来源与竞品观察

- [Adobe：Document properties and metadata overview](https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-pdf-properties/pdf-properties.html)
- [Adobe：View document metadata](https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-pdf-properties/view-metadata.html)
- [Adobe：Sanitize PDFs and remove hidden content](https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/sanitize.html)
- [AI Metadata Cleaner 的 PDF 页](https://aimetadatacleaner.com/remove-metadata-from-pdf)

竞品 PDF 页写明：检测可在浏览器内进行，清理需要免费账户并发送至服务器；本次查到的页面同时描述签名和内嵌照片处理。未独立运行其清理流程，不据此宣称我们清理更全面。

本页选择的实际角度：无需上传和注册，先查看、后清理，并解释文档级范围。技术说明以项目源码／测试为产品依据，Adobe 文档为概念和独立检查依据。未复制竞品文案或插画。

## 产品事实与验证边界

- `src/lib/metadata/pdf.ts`：读取 Info 和支持的 XMP 字段；移除 Info 字典引用、目录级 Metadata 流，然后重新保存 PDF。
- 本次补齐：只有自定义／压缩 XMP 时也显示 XMP 条目，保持“清理”可操作；不会把无法逐项展示的 XMP 当作不存在。
- `src/lib/metadata/types.ts`：10,000,000 字节的共同输入上限。文件大小展示统一使用十进制 MB，避免超限 10 MB 文件显示成 9.5 MB。
- `src/blocks/metadata-remover-home.tsx`：共享浏览器工具；PDF 模式限制扩展名，实际文件内容仍由引擎校验；动态加载 pdf-lib，避免破坏 SSR。
- 未承诺：批注／附件／表单／隐藏页内容清理、内嵌照片 EXIF 清理、文档 ID 清理、完整匿名化、数字签名有效性、任意历史信息不可恢复。

## SEO 实施

- 主词出现在英文 Title、description、H1、首段、范围 H2 和描述实际画面的 alt；自然分布，不以固定密度作为排名指标。
- 核心内容和 FAQ 服务端输出；每种语言一个 H1。
- 四种语言独立 canonical，hreflang 含 en／zh／es／ar／x-default，正式域名为 filemetawipe.com。
- WebPage、WebApplication、BreadcrumbList JSON-LD 对应实际工具；无虚构评分、评价或专家身份。
- FAQ 使用可访问的原生 details，不新增 FAQPage／HowTo 以承诺 Google 富结果。
- 首页 PDF 格式表、主导航、页脚加入内链；sitemap 四种语言新增路由及实际修改日；llms.txt 同步。
- 继续隐藏 pricing，不加入 sitemap。

## 生成插画

使用内置 image_gen 工具，未使用外部 CLI/API。下列透明 WebP 保留生成图 alpha：

- `public/images/pdf-metadata/pdf-properties-eraser.webp`：960×640，约 56 KB。
- `public/images/pdf-metadata/pdf-properties-eraser-480.webp`：480×320，约 21 KB。

通过 srcset 提供响应式尺寸，声明宽高避免布局偏移。图片不含语言相关长文案；文字标签和三步流程由 HTML 提供，可翻译且可抓取。流程图用现有 Lucide 符号与连接线，保持流程含义清晰。

生成提示词见下文。缩放和 WebP 编码使用本地 cwebp，不改绘画面内容。

```text
Use case: stylized-concept. Create one original polished conceptual illustration for a PDF metadata remover website. A softly dimensional off-white PDF document sheet standing at a slight angle, with a small dark evergreen tab clearly labeled PDF. A separate oversized cream luggage-like metadata tag is attached to the sheet with a thin curved grey string; the tag contains small muted grey horizontal bars representing hidden author/title/date properties, and a generous evergreen-and-cream eraser visibly removes the bars from the bottom half of this tag. The actual content lines on the document remain intact, communicating removal of hidden properties while preserving page content. Subtle soft contact shadows, refined flat vector-like shapes with slight 3D paper thickness, editorial software product illustration, restrained friendly aesthetic like a well-crafted privacy tool. Palette off-white #fffdf8, evergreen #0e6b64, ink #14221f, warm grey and very small muted gold accent. Transparent background, isolated composition, no surrounding UI, no photos, no people, no gradients or neon, no shields or locks, no extra words or watermarks, no AI sparkle motifs. Composition horizontal approximately 3:2, two bold readable objects, comfortable negative space around all edges. Only text is PDF.
```

## 验收记录

- `pnpm build`、`pnpm cf:build`：通过；i18n 检查四种语言共 2540 条消息一致。
- 定向 Vitest：6 个文件，39 项通过；覆盖 PDF／图片引擎、压缩和自定义 XMP 回归、10 MB 十进制显示、SSR 动态加载边界、公共域名 canonical 和首页缓存。
- 生产 Node 构建四种语言路由：HTTP 200；服务端正文存在；每页 1 个 H1、12 个 FAQ、1 个正式域名 canonical、5 个语言链接；JSON-LD 可解析。
- sitemap／llms.txt：包含新 PDF 路由，pricing 继续排除。
- 浏览器实际流程：选择带作者、标题、日期和 XMP 的临时测试 PDF → 检测字段 → 清理并下载 → 重选下载副本，未检测到支持的元数据。独立读取下载文件：Info 与目录 XMP 均不存在，1 页 A4 尺寸保留，页面内容流字节与输入一致。
- 浏览器错误流程：非 PDF 正确拒绝；10,000,001 字节文件正确拒绝。过程中发现旧格式化以二进制计算却标 MB，已改为与限制一致的十进制单位并增加断言。
- 响应式：1280px 桌面、375px 中文及阿拉伯语手机检查；插图加载；无横向溢出；FAQ 可展开；中文页内锚点保持语言；阿拉伯语 RTL。
- 英文生产 HTML 关键词核验：主词在 Title、description、H1、H2 各出现 1 次；main 范围约 1130 个英文词单位，完整短语出现 4 次，约每 100 词 0.354 次。此指标不是排名阈值。无关键词检查缺项。
- `tsc --noEmit`：项目全量检查仍有现存无关错误；本次涉及文件未出现在错误列表中。不宣称全项目类型检查通过。
- 尚未验证：正式域名部署后的实际响应、Google 收录／排名、AI 引用，以及付费工具月搜索量。
