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
try:
    model = WhisperModel('base', device='cpu', compute_type='int8', cpu_threads=2,
                         num_workers=1, download_root=cache,
                         local_files_only=mode == '--check')
except Exception as error:
    # Exception strings may contain local paths or signed model URLs. Never emit them.
    category = type(error).__name__
    if mode == '--check':
        fail('model_missing')
    if category in ('ProxyError', 'ConnectError', 'SSLError', 'LocalEntryNotFoundError',
                    'HfHubHTTPError', 'ReadTimeout', 'ConnectTimeout', 'HTTPStatusError'):
        fail('model_download_blocked')
    fail('model_unavailable')

if mode in ('--prepare', '--check'):
    print(json.dumps({'ready': True, 'model': 'base', 'device': 'cpu'}))
    sys.exit(0)

try:
    segments, info = model.transcribe(mode, language=sys.argv[3], vad_filter=True, beam_size=3)
    if info.duration > 600:
        fail('audio_too_long')
    text = ' '.join(segment.text.strip() for segment in segments).strip()
except Exception:
    fail('audio_decode')
if not text:
    fail('no_speech')
print(json.dumps({'text': text}, ensure_ascii=False))
