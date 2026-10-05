"""Voice activity detection (Silero VAD, ONNX). usage: python3 vad.py <workdir>
expects <workdir>/a16.wav (mono 16 kHz). writes speech.json [{start, end}] in seconds.
"""
import sys, json
import soundfile as sf
import torch
from silero_vad import load_silero_vad, get_speech_timestamps

model = load_silero_vad(onnx=True)
wav = torch.from_numpy(sf.read(f"{sys.argv[1]}/a16.wav", dtype="float32")[0])
ts = get_speech_timestamps(wav, model, return_seconds=True, min_silence_duration_ms=250)
json.dump(ts, open(f"{sys.argv[1]}/speech.json", "w"))
print(len(ts), "speech segments")
