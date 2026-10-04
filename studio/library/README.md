# Library (licensed media you supply)

Nothing in here is committed except this file. Put licensed media on the production machine:

```
studio/library/
  music/index.json       [{ "file": "track.wav", "function": "engineering", "duration_s": 180, "license": "...", "credit": "..." }]
  ambience/index.json    [{ "file": "ocean.wav", "tags": ["ocean", "ship", "wind"], "license": "...", "credit": "..." }]
  footage/**/<clip>.mp4  + <clip>.mp4.json  (asset metadata, see bibles/_common/04_ASSET_SYSTEM.md)
```

Music `function` values: investigation, scale, engineering, threat, action, ending.
Each act gets one function (act 1 investigation, 2 scale, 3–4 engineering, 5 threat, 6 action, 7 ending).
Ambience is matched to each sequence by tags; a track tagged `room` is the fallback.
Only use music licensed for monetized YouTube.
