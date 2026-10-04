# Reference analysis tools

Measures the editing and audio rhythm of a reference video. Results feed `../00_REFERENCE_ANALYSIS.md`.

Requirements: ffmpeg, Python 3 with `numpy pillow soundfile silero-vad onnxruntime torch`.

```bash
W=work/<name>; mkdir -p $W
# 1. small frames for cut detection (64x36, 15 fps)
ffmpeg -i video.mp4 -vf "fps=15,scale=64:36" -pix_fmt rgb24 -f rawvideo $W/small.rgb
# 2. mono 16 kHz audio for VAD and levels
ffmpeg -i audio_or_video.mp4 -vn -ac 1 -ar 16000 $W/a16.wav
# 3. transitions (+ cutpairs_N.png sheets for checking by eye)
python3 detect.py $W 0.25 0.2
# 4. speech segments
python3 vad.py $W
# 5. metrics.json
python3 metrics.py $W
# integrated loudness and LRA
ffmpeg -nostats -i audio.m4a -af ebur128 -f null - 2>&1 | grep -A12 Summary
```

Always check `cutpairs_*.png` by eye. Automatic detection misses some transitions inside dark, low-contrast dissolves.
