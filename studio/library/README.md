# Library (licensed media you supply)

Licensed media for the studio. Music and ambience currently in here are committed; check the license before adding anything (see `bibles/_common/06_AUDIO_BIBLE.md` §3 for the current music list and how it was chosen).

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
