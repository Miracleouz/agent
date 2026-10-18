"""Local speech recognition. Only safe error codes leave this process."""
import json
import sys


def fail(code):
    print(json.dumps({'error': code}), file=sys.stderr, flush=True)
    sys.exit(1)


try:
    from faster_whisper import WhisperModel
except ImportError:
    fail('engine_missing')

mode = sys.argv[1]
cache = sys.argv[2]
model_name = 'large-v3-turbo'
try:
    model = WhisperModel(model_name, device='cpu', compute_type='int8', cpu_threads=2,
                         num_workers=1, download_root=cache,
                         local_files_only=mode != '--prepare')
except Exception as error:
    # Exception strings may contain local paths or signed model URLs. Never emit them.
    category = type(error).__name__
    if mode != '--prepare' and category == 'LocalEntryNotFoundError':
        fail('model_missing')
    if category in ('ProxyError', 'ConnectError', 'SSLError', 'LocalEntryNotFoundError',
                    'HfHubHTTPError', 'ReadTimeout', 'ConnectTimeout', 'HTTPStatusError'):
        fail('model_download_blocked')
    fail('model_unavailable')

if mode in ('--prepare', '--check'):
    print(json.dumps({'ready': True, 'model': model_name, 'device': 'cpu'}))
    sys.exit(0)

try:
    segments, info = model.transcribe(mode, language=sys.argv[3], vad_filter=True,
                                    beam_size=5, temperature=0,
                                    condition_on_previous_text=False, word_timestamps=True,
                                    max_new_tokens=256,
                                    hotwords='correia, correias, sincronizadora, poliuretano, aço, AT5, AT10, T20')
    if info.duration > 600:
        fail('audio_too_long')
    segments = list(segments)
    text = ' '.join(segment.text.strip() for segment in segments).strip()
    # Repetition can be a decoder hallucination on very short/noisy recordings.
    import re
    tokens = re.findall(r'\w+', text.lower())
    if any(tokens.count(word) >= 4 and tokens.count(word) > len(tokens) / 2
           for word in set(tokens)):
        fail('speech_uncertain')
    uncertain = any(getattr(segment, 'avg_logprob', 0) < -0.6 or
                    any(any(c.isdigit() for c in word.word) and word.probability < 0.65
                        for word in (getattr(segment, 'words', None) or []))
                    for segment in segments)
except Exception:
    fail('audio_decode')
if not text:
    fail('no_speech')
print(json.dumps({'text': text, 'uncertain': uncertain}, ensure_ascii=False))
