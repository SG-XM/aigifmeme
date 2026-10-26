# Bulin reference video and soundtrack experiments

The Bulin generator offers two verified 15-second source windows, with independent selectors for the reference video and replacement soundtrack:

- Seconds 7–22: historical H.264/AAC clip (4,128,938 bytes) and audio copied from that clip.
- Seconds 4–19: current H.264/AAC clip and audio copied from that clip.

The user confirmed the historical window by comparing it with the original source. Its decoded audio correlates with the original at a 7-second offset (0.9993); the current clip correlates at a 4-second offset (0.9994). Both are 720×1280, 24 fps, and 15 seconds long.

The UI previews each video and audio choice. Both selected IDs are saved in the AI task options and shown on active tasks and Library history. The server maps IDs to fixed catalog URLs, so clients cannot submit arbitrary media URLs or lengths. Audio selection is independent from reference selection and is trimmed to the generated video's duration.

Jobs created before selectors were introduced continue using the legacy soundtrack asset. The default selection is seconds 4–19 for both media fields, matching the current live experiment assets.

The original source was uploaded unchanged to R2 for archival use; the 46-second full video is not offered to the generation model because its reference-video limit is shorter.
