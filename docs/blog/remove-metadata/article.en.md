---
status: draft
language: en
slug: how-to-remove-metadata
seo_title: 'How to Remove Metadata from Files | FileMeta Wipe'
description: 'Learn how to remove metadata from images, PDFs, Word and Excel files without uploading them, then verify the cleaned copy and check what remains.'
author: FileMeta Wipe team
fact_checked: 2026-11-03
---

# How to Remove Metadata from Images, PDFs and Office Files

To remove metadata from a file, inspect its hidden properties, clear the supported fields, then check the downloaded copy. [FileMeta Wipe](https://filemetawipe.com/) does this in your browser without uploading your file or requiring an account. It supports PDFs, DOCX and XLSX documents, and JPEG, PNG, WebP and GIF images, with a 10 MB input limit per file.

The last step matters. A download button confirms that you received a file; it does not tell you whether the information you wanted to remove is gone. This guide walks through the cleanup and shows how to verify the result.

## What should you check before you remove metadata?

Start with the identifying detail you want to stop sharing: a photo's GPS coordinates, a PDF's author name, or a company name in a document template. Then check where that detail lives.

| File                    | Metadata this tool targets                                               | Information to review separately                                                   |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| JPEG, PNG, WebP and GIF | Supported EXIF, XMP, IPTC, text or comment data, depending on the format | Visible faces, addresses, landmarks and text in the picture                        |
| PDF                     | The document Info dictionary and document-level XMP packet               | Page text, comments, attachments, form values and metadata inside embedded objects |
| Word DOCX               | Core, extended and custom document properties                            | Comments, tracked changes, embedded files and names written into the document      |
| Excel XLSX              | Core, extended and custom workbook properties                            | Hidden worksheets, comments, formulas and cell values                              |

Removing the Author property from a résumé will not remove a name printed at the top of the page. If the identifying detail is visible content, use an editing or redaction workflow for that content.

## How to remove metadata without uploading your file

### 1. Keep the original and choose the final version

Use a copy you are allowed to edit. Finish your document or image edits first: saving or exporting again after cleaning can write new metadata.

Choose one supported file no larger than 10 MB. Password-protected PDFs are not supported. Avoid rewriting a digitally signed PDF when you need to preserve signature validity.

### 2. Inspect the file before clearing anything

Open the [metadata remover](https://filemetawipe.com/) and select **Choose a file**, or drag the file into the drop area. Selecting it reads the file locally in the browser; it does not upload the file to a cleaning server.

Before you remove metadata, read the detected fields. For a PDF, look for Author, Title, Creator, Producer, Created, Modified and XMP entries. For a photo, check for camera information and GPS when those fields are present. For DOCX or XLSX, look for author, company, application and related properties.

An empty result means the scanner did not detect supported removable fields. It does not prove that every identifying detail is absent.

### 3. Remove metadata and download the copy

Select **Remove metadata**. The tool builds a separate copy, inspects the output again and downloads it. The original file on your device is not edited.

Review the before-and-after fields. If you need the output again, select **Download cleaned file**. Keep track of the downloaded copy's filename so you do not accidentally send the original.

### 4. Verify the downloaded file

Clear the current selection and choose the downloaded copy. Check whether the fields you wanted to clear are still detected. Then open the copy in your usual viewer and inspect its pages or images, including layout, orientation, links and any forms you use.

This second pass catches obvious mistakes, such as selecting the wrong file. For an independent check, use another metadata reader or your document application's inspection tools. The same scanner can miss the same field twice.

## What changes when you remove metadata from a PDF?

We created a one-page test PDF with a title, author and document-level XMP, used the browser tool to remove metadata, then independently reopened the downloaded copy with a PDF library.

| Check              | Before            | After  |
| ------------------ | ----------------- | ------ |
| Author             | Editorial Team    | Absent |
| Title              | Publication draft | Absent |
| Document-level XMP | Present           | Absent |
| Page count         | 1                 | 1      |

The page-content stream bytes were unchanged in this example. That is a specific check of one generated PDF, not a claim that every possible PDF structure has been tested or that the file is fully anonymous. For the PDF-specific workflow and scope, use the [PDF Metadata Remover](https://filemetawipe.com/pdf-metadata-remover).

## How do you verify a file after you remove metadata?

### Images and PDFs: read the metadata independently

If you already have ExifTool installed, these are read-only inspection commands. Replace the example filenames with your downloaded copies:

```bash
exiftool -a -G1 -s "photo-cleaned.jpg"
exiftool -a -G1 -s "report-cleaned.pdf"
```

The options show duplicate tags, their groups and their tag names. Look for the specific author, location or other values you intended to remove, rather than expecting the output to be empty. [ExifTool's FAQ](https://exiftool.org/faq.html) explains these options.

You can also inspect a PDF's document properties and additional metadata in Acrobat. Checking only the visible Author box does not inspect every possible location in the file. [Adobe's metadata viewing instructions](https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-pdf-properties/view-metadata.html) describe the inspection view.

### Word and Excel: inspect more than properties

For a supported Windows desktop Office version, save a copy and use **File → Info → Check for Issues → Inspect Document**. Review the results, remove the categories you intend to remove, and inspect again. Menu availability depends on the application and version.

Microsoft's Document Inspector covers categories beyond document properties, including comments and revisions. That makes it useful when the information you need to remove is outside FileMeta Wipe's property-cleaning scope. Follow [Microsoft's instructions and limitations](https://support.microsoft.com/en-us/office/remove-hidden-data-and-personal-information-by-inspecting-documents-presentations-or-workbooks-356b7b5d-77af-44fe-a07f-9aa4d085966f), and work on a copy.

## Why does some information still appear?

| What you see                                        | What to check next                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A created or modified time in Finder or Explorer    | File-system dates are separate from embedded document dates. A new download can have a new file-system timestamp.         |
| An author name after cleaning                       | Confirm that you opened the cleaned copy. Check whether the name is in page text, a comment or an attachment.             |
| Metadata returns after another export               | Inspect and clean the final export, after the last edit.                                                                  |
| Image width, file type or color-profile information | These are not the same as an author name or GPS location. The image cleaner retains color profiles needed for appearance. |
| No detected fields, but a visible name remains      | Removing properties does not redact words, faces or other visible identifying details.                                    |

ExifTool labels file-system timestamps separately from embedded tags; its [FAQ](https://exiftool.org/faq.html) includes examples of that distinction.

## Frequently asked questions

### Can I remove metadata online for free?

Yes. FileMeta Wipe's supported file inspection, cleanup and download are free and do not require an account. The workflow handles one file at a time, with a 10 MB input limit.

### Can I remove metadata without reducing image quality?

The image cleaner removes supported metadata blocks without recompressing the encoded picture data. Open the downloaded image and check its appearance and orientation before sharing it. Metadata removal and image compression are separate tasks.

### Does clearing metadata make a file anonymous?

No. Identifying information may remain in the filename, visible content, comments, attachments or other structures outside the cleanup scope. For sensitive document review, metadata removal is one step in a broader inspection. [Adobe's sanitization documentation](https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/sanitize.html) describes a broader PDF workflow.

### Do clear metadata, delete metadata and remove metadata mean different things?

In cleanup instructions, these phrases commonly refer to removing stored properties. The wording does not define the coverage. Check which fields and file structures a tool actually handles, then verify the copy it produces.

## Before you share the cleaned copy

- Confirm that you selected the downloaded copy, not the original.
- Recheck the properties you intended to clear.
- Open the file and review its visible content and layout.
- Review the filename, comments and attachments separately when relevant.
- If you edit or export again, inspect the new final copy.

[Remove metadata from a supported file](https://filemetawipe.com/) before sharing it. Keep the original, use the cleaned copy and verify the result that matters to you.
