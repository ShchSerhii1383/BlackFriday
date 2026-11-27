"""Рендер MIDI у 8-bit звук: pulse/triangle-хвилі для інструментів, шум для барабанів.
Використання: python3 render_midi.py in.mid out.wav"""
import sys
import mido
import numpy as np
import wave

SR = 32000

# канал → (хвиля, ширина імпульсу, гучність, атака с, реліз с, спад до рівня)
VOICES = {
    0: ('pulse', 0.50, 0.20, 0.004, 0.04, 0.85),   # Lead Vox — мелодія
    1: ('pulse', 0.125, 0.09, 0.003, 0.05, 0.6),   # Intro Chime Synth
    2: ('tri', None, 0.34, 0.003, 0.03, 1.0),      # Bass
    3: ('pulse', 0.25, 0.045, 0.002, 0.02, 0.5),   # Guitar (акорди)
    4: ('pulse', 0.25, 0.08, 0.002, 0.08, 0.45),   # Piano
    5: ('pulse', 0.125, 0.06, 0.002, 0.05, 0.6),   # Crystal Runs
    6: ('pulse', 0.50, 0.055, 0.04, 0.10, 1.0),    # Strings
}


def collect(path):
    mid = mido.MidiFile(path)
    t = 0.0
    active, notes = {}, []
    for msg in mid:                       # час у секундах з урахуванням змін темпу
        t += msg.time
        if msg.type == 'note_on' and msg.velocity > 0:
            active[(msg.channel, msg.note)] = (t, msg.velocity)
        elif msg.type in ('note_off', 'note_on'):
            k = (msg.channel, msg.note)
            if k in active:
                st, vel = active.pop(k)
                notes.append((msg.channel, msg.note, st, max(t - st, 0.03), vel))
    return notes, t


def env(n, a, r, sustain):
    e = np.ones(n)
    na, nr = max(int(a * SR), 1), max(int(r * SR), 1)
    na = min(na, n); e[:na] = np.linspace(0, 1, na)
    if sustain < 1:                      # плавний спад до рівня sustain (пізикато-відчуття)
        k = np.arange(n - na)
        e[na:] = sustain + (1 - sustain) * np.exp(-k / (0.18 * SR))
    nr = min(nr, n); e[-nr:] *= np.linspace(1, 0, nr)
    return e


def tone(kind, duty, freq, n):
    ph = (np.arange(n) * freq / SR) % 1.0
    if kind == 'pulse':
        return np.where(ph < duty, 1.0, -1.0)
    return 4 * np.abs(ph - 0.5) - 1      # triangle


rng = np.random.default_rng(7)


def drum(note, vel):
    v = vel / 127
    if note in (35, 36):                 # бочка: синус із падінням висоти
        n = int(0.16 * SR); t = np.arange(n) / SR
        f = 150 * np.exp(-t * 28) + 45
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 18) * 0.55 * v
    if note in (38, 40, 37, 39):         # малий: шум + тон
        n = int(0.14 * SR); t = np.arange(n) / SR
        s = rng.uniform(-1, 1, n) * np.exp(-t * 26) * 0.32
        s += np.sin(2 * np.pi * 190 * t) * np.exp(-t * 40) * 0.15
        return s * v
    if note in (49, 57, 52, 55):         # тарілка
        n = int(0.7 * SR); t = np.arange(n) / SR
        s = rng.uniform(-1, 1, n); s = np.diff(s, prepend=0)  # грубий high-pass
        return s * np.exp(-t * 5) * 0.12 * v
    n = int((0.11 if note == 46 else 0.035) * SR); t = np.arange(n) / SR  # хай-хети тощо
    s = rng.uniform(-1, 1, n); s = np.diff(s, prepend=0)
    return s * np.exp(-t * 60) * 0.09 * v


def render(path):
    notes, total = collect(path)
    out = np.zeros(int((total + 1.5) * SR))
    for ch, note, st, dur, vel in notes:
        i = int(st * SR)
        if ch == 9:
            s = drum(note, vel)
        else:
            kind, duty, vol, a, r, sus = VOICES.get(ch, ('pulse', 0.25, 0.05, 0.003, 0.04, 0.7))
            n = int((dur + r) * SR)
            freq = 440 * 2 ** ((note - 69) / 12)
            s = tone(kind, duty, freq, n) * env(n, a, r, sus) * vol * (0.55 + 0.45 * vel / 127)
        out[i:i + len(s)] += s[:len(out) - i]
    out /= max(1e-9, np.max(np.abs(out))) / 0.9
    return out


if __name__ == '__main__':
    audio = render(sys.argv[1])
    pcm = (audio * 32767).astype('<i2')
    with wave.open(sys.argv[2], 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print('rendered', round(len(audio) / SR, 1), 's')
