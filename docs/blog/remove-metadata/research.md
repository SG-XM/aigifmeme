# Remove metadata：英文博客调研与编辑说明

日期：2026-11-03。交付：英文完整草稿与证据记录；未写入 post 数据库、未发布、未推送。建议 URL 为 `/blog/how-to-remove-metadata`，与首页的工具使用意图、PDF 内页的格式专用意图区分，文章主要回答“怎么做、怎么复查和排错”。不新增中文、西班牙语或阿拉伯语版本。

## 当前首页

代码中 Title：`Metadata Remover for Documents & Images — No Upload`。

代码中 description：`Remove metadata from PDF, Word, Excel and images online free. Inspect and clear supported fields in your browser, without uploading your file.`

本次从正式站读取的 description 仍是旧版 `Remove PDF, DOCX, XLSX and image metadata locally in your browser...`。这说明本次响应未体现已 push 的描述，不能把 Git 推送当作上线验证；可能需要检查部署与缓存。本次未改首页。

## 输入与关键词

- 用户主词原文：`remove metadata`。
- 文章语言：英语；面向想在分享前处理图片、PDF 或 Office 文件的普通用户。
- 支撑问题：如何无需上传清理、如何复查、为何仍有日期、为何仍有作者、清理是否影响画质、清理能否匿名化。
- `clear metadata`、`delete metadata` 在 FAQ 作为操作措辞解释，不为同义词建立重复文章。
- `metadata reader` 是检查意图：本文安排独立验证，不把本文伪装成单独 reader 工具页。
- 用户提供的竞品关键词表缺少列标题和地区定义；未将其中数字转写为本页关键词月搜索量。

## 竞品与来源

已读取 [Metadata2Go 的 remove-metadata 博文](https://www.metadata2go.com/blog/remove-metadata)。结构以背景解释、产品理由、四步使用说明、格式覆盖及工具入口为主；未见独立验证和失败排查章节。本文采用自己的实测案例与产品流程，不复制其段落。

技术来源：

- [Microsoft Document Inspector](https://support.microsoft.com/en-us/office/remove-hidden-data-and-personal-information-by-inspecting-documents-presentations-or-workbooks-356b7b5d-77af-44fe-a07f-9aa4d085966f)：Office 检查入口及属性之外的检查类别。
- [Adobe View document metadata](https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-pdf-properties/view-metadata.html)：PDF 的独立查看入口。
- [Adobe Sanitize PDFs](https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/sanitize.html)：元数据清理与更广泛文档清理的区别。
- [ExifTool FAQ](https://exiftool.org/faq.html)：`-a -G1 -s` 只读检查参数，FileModifyDate 与文件系统信息。直连部分文档返回 403，使用搜索返回的官方内容核对；未使用第三方教程作为命令依据。

本次搜索包括：`remove metadata how to verify author GPS file modified date still there`；Microsoft 官方文档相关查询；ExifTool `FileModifyDate System` 与 `exiftool -a -G1 -s` 官方域名查询。

ChatGPT 实际调研待完成：此前浏览器检查只获得匿名入口，本次未发送 prompt、未取得 ChatGPT 回答或引用样本。待执行中立问题：`How can I remove metadata from images, PDFs and Word files without uploading them, and verify the result?`。草稿角度以产品、搜索和官方资料为依据，尚未完成 AI 推荐／引用调研；不编造模型回答。

## 文章角度与事实依据

主角度：先查看、清理、下载，再复查，而不是仅解释元数据是什么。

辅助角度：本地处理且无需账号；按格式区分清理范围；用另一个阅读器复查；解释为什么时间和姓名还可能存在。

事实来源：

- `src/blocks/metadata-remover-home.tsx`：文件选择、10 MB 校验、检测、清理、重新检测、下载、前后对比；引擎动态导入，处理不调用清理服务器。
- `src/lib/metadata/pdf.ts`：Info 和文档目录级 XMP 清理；不声称清理整个 PDF 的全部信息。
- `src/lib/metadata/ooxml.ts`：DOCX/XLSX 的 docProps 核心、扩展、自定义属性处理。
- `src/lib/metadata/image.ts`：按格式移除支持的属性块，保留编码图像数据和色彩配置；文中要求目视检查方向与画面，不承诺任意文件完全一致。
- `src/lib/metadata/types.ts`：输入上限 10,000,000 字节。

本次重新独立打开了前序浏览器测试产生的 PDF 原件与下载副本：作者 Editorial Team、标题 Publication draft 在副本中为空，目录级 XMP 不存在，仍为一页，页面内容流字节一致。详见 `evidence.json`。案例只适用于这一份生成的非敏感 PDF，不能推及所有格式或所有 PDF 结构。

ExifTool 命令依据官方资料核对，但没有在本机执行 ExifTool；不得将其写成本文实跑结果。Office 独立检查步骤依据 Microsoft 文档，未声称本次完成了各 Office 版本的界面实测。

## 关键词与交付核验

按用户要求提高完整短语频率后，英文稿为 1304 个词单位。`remove metadata` 在 SEO Title、description、H1 各出现 1 次，在 H2 出现 4 次；article 范围完整短语出现 14 次，约每 100 词 1.074 次（约 1.07%）。article 统计包含文章各级标题，排除 SEO Title、description、导航与页脚。此前稿件为 1290 个词单位、6 次、约 0.465%。本次通过调整步骤、检查、案例、验证、FAQ 和结尾链接的自然措辞增加频率；约 1% 是本次编辑目标，不是排名指标。

审计使用草稿转换后的临时 HTML，不是线上文章响应。`keyword-audit.json` 的 canonical 缺失提示是草稿阶段的预期状态；发布时由现有 blog 路由生成 canonical、BlogPosting 和实际日期。未宣称部署、收录或 AI 引用已完成。

发布建议：使用现有 post 内容模型，英文正文写入 body，其他语言正文保持空；站点地图与 hreflang 按现有可用正文语言规则仅声明英语。新建前检查 slug 是否已存在。文章中的首页／PDF 工具内链需在正式站部署后确认可访问。
