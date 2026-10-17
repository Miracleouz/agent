import sys, json
from faster_whisper import WhisperModel
model = WhisperModel('base', device='cpu', compute_type='int8', cpu_threads=2, num_workers=1, download_root=sys.argv[2])
segments, info = model.transcribe(sys.argv[1], language=sys.argv[3], vad_filter=True, beam_size=3)
if info.duration > 600:
    raise ValueError('Audio longer than 10 minutes')
print(json.dumps({'text': ' '.join(s.text.strip() for s in segments)}, ensure_ascii=False))
