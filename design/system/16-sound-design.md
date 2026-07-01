# Sound Design — The Audio Soul

> *"Sound is the vocabulary of nature. It speaks to us on a primal level."*
> — Randy Thom, Sound Designer

---

## 🎯 Filosofi Audio

Suara di BETE bukan sekadar efek — ia adalah **layer konfirmasi non-visual**:

1. **Subtle & non-intrusive** — Volume rendah, durasi pendek
2. **Meaningful** — Setiap suara punya makna spesifik
3. **Context-aware** — Suara yang berbeda untuk konteks berbeda
4. **Opt-out** — Semua suara bisa dimatikan

---

## 🔔 Sound Catalog

### UI Feedback Sounds

| Event | Sound Type | Duration | Volume | Description |
|-------|-----------|----------|--------|-------------|
| Button click | Pop | 80ms | 0.3 | Subtle tick |
| Toggle on | Click | 100ms | 0.3 | Switch engage |
| Toggle off | Click | 100ms | 0.2 | Switch release |
| Modal open | Whoosh | 200ms | 0.2 | Soft slide |
| Modal close | Whoosh | 150ms | 0.15 | Quick retreat |
| Toast appear | Ding | 300ms | 0.3 | Notification |
| Error toast | Buzz | 200ms | 0.4 | Warning |

### Moderation Sounds

| Event | Sound | Duration | Volume | Description |
|-------|-------|----------|--------|-------------|
| Message flagged | Chime | 400ms | 0.3 | Attention tone |
| Critical alert | Siren | 1s | 0.5 | Urgent pattern |
| Analysis complete | Ping | 200ms | 0.2 | Completion |

### Voice Channel Sounds

| Event | Sound | Duration | Volume |
|-------|-------|----------|--------|
| User joins | Connect | 150ms | 0.2 |
| User leaves | Disconnect | 150ms | 0.2 |
| Recording start | Record-on | 200ms | 0.3 |
| Recording stop | Record-off | 200ms | 0.2 |

---

## 🎵 Audio Implementation

### Sound Manager

```typescript
// shared/lib/sound.ts
class SoundManager {
  private static instance: SoundManager;
  private enabled = true;
  private volume = 0.5;
  private audioCache = new Map<string, HTMLAudioElement>();

  static getInstance(): SoundManager {
    if (!this.instance) this.instance = new SoundManager();
    return this.instance;
  }

  async play(soundId: string): Promise<void> {
    if (!this.enabled) return;

    let audio = this.audioCache.get(soundId);
    if (!audio) {
      audio = new Audio(`/sounds/${soundId}.mp3`);
      this.audioCache.set(soundId, audio);
    }

    audio.volume = this.volume;
    audio.currentTime = 0;
    await audio.play().catch(() => {}); // Swallow autoplay errors
  }

  setEnabled(enabled: boolean): void { this.enabled = enabled; }
  setVolume(volume: number): void { this.volume = Math.max(0, Math.min(1, volume)); }
}

export const sound = SoundManager.getInstance();
```

### Preloading Strategy

```typescript
// Preload critical sounds on app init
function preloadSounds(): void {
  const criticalSounds = ['click', 'toggle', 'notification'];
  criticalSounds.forEach(id => {
    const audio = new Audio(`/sounds/${id}.mp3`);
    audio.preload = 'auto';
  });
}

// Call on app bootstrap
document.addEventListener('DOMContentLoaded', preloadSounds);
```

---

## 🎚️ Sound Settings

```tsx
// features/settings/SoundSettings.tsx
function SoundSettings() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sound</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ToggleGroup>
          <Toggle
            pressed={soundEnabled}
            onPressedChange={(v) => {
              setSoundEnabled(v);
              sound.setEnabled(v);
            }}
            label="Sound Effects"
          />
        </ToggleGroup>

        {soundEnabled && (
          <div>
            <Label>Volume</Label>
            <Slider
              value={[soundVolume]}
              onValueChange={([v]) => {
                setSoundVolume(v);
                sound.setVolume(v);
              }}
              min={0}
              max={1}
              step={0.1}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## 🔊 Audio Feedback Implementation

### React Hook

```tsx
// hooks/useSound.ts
function useSound(soundId: string) {
  const play = useCallback(() => {
    sound.play(soundId);
  }, [soundId]);

  return play;
}

// Usage
function DeleteButton({ onClick }: { onClick: () => void }) {
  const playClick = useSound('click');
  const playError = useSound('error');

  const handleClick = async () => {
    playClick();
    try {
      await onClick();
    } catch {
      playError();
    }
  };

  return <Button onClick={handleClick}>Delete</Button>;
}
```

### Toast + Sound Integration

```tsx
function useToastWithSound() {
  const { toast } = useToast();

  return useCallback((t: ToastInput) => {
    toast(t);

    switch (t.type) {
      case 'success': sound.play('success'); break;
      case 'error':   sound.play('error');   break;
      case 'warning': sound.play('warning'); break;
      case 'info':    sound.play('info');    break;
    }
  }, [toast]);
}
```

---

## 📄 Sound File Structure

```
public/sounds/
├── ui/
│   ├── click.mp3           # 80ms
│   ├── toggle-on.mp3       # 100ms
│   ├── toggle-off.mp3      # 100ms
│   ├── modal-open.mp3      # 200ms
│   ├── modal-close.mp3     # 150ms
│   └── notification.mp3    # 300ms
├── moderation/
│   ├── flagged.mp3         # 400ms
│   ├── critical.mp3        # 1s
│   └── analysis-done.mp3   # 200ms
├── voice/
│   ├── user-join.mp3       # 150ms
│   ├── user-leave.mp3      # 150ms
│   ├── recording-start.mp3 # 200ms
│   └── recording-stop.mp3  # 200ms
└── _index.json             # Sound metadata
```

### Sound Metadata

```json
{
  "ui/click": {
    "duration": 80,
    "volume": 0.3,
    "category": "feedback",
    "critical": true
  },
  "moderation/critical": {
    "duration": 1000,
    "volume": 0.5,
    "category": "alert",
    "critical": true
  }
}
```

---

## ♿ Accessibility & Sound

```typescript
// Respect system accessibility settings
function shouldPlaySound(): boolean {
  // iOS: silent switch
  if (navigator.mediaSession?.playbackState === 'none') return false;
  return true;
}

// Before playing:
if (!shouldPlaySound()) return;

// User preference always wins
if (!userSettings.soundEnabled) return;
```

---

## ⚠️ Sound Anti-Patterns

### ❌ Mandatory sounds
```tsx
// ❌ JANGAN — user tidak bisa mematikan
sound.play('loud-intro-music');

// ✅ Always respect user preference
if (userSettings.soundEnabled) sound.play('subtle-click');
```

### ❌ Long or repetitive sounds
```tsx
// ❌ JANGAN — 5 detik sound effect mengganggu
sound.play('complex-jingle');

// ✅ Durasi pendek, sekali main
sound.play('quick-chime');
```

### ❌ No audio context check
```tsx
// ❌ JANGAN — play tanpa cek autoplay policy
new Audio('/sounds/click.mp3').play();

// ✅ Handle autoplay rejection
const audio = new Audio('/sounds/click.mp3');
await audio.play().catch(() => {});  // Silently fail
```

---

## 🔗 Referensi

| Sumber | Konsep |
|--------|--------|
| [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) | Audio playback |
| [Game UX Sound Design](https://www.gamedeveloper.com/audio/) | Sound design patterns |
| [WCAG Auditory](https://www.w3.org/WAI/WCAG21/Understanding/audio-control.html) | Audio accessibility |

---

*"Suara adalah gaung ingatan — setiap klik adalah bisikan dari masa lalu."* ❄️🩵
