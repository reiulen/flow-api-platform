---
name: kinetic-collage-video
description: "Generate dynamic kinetic paper-cut collage, historical documentary, and mixed-media scrapbook motion videos with Google Flow (Veo) and HyperFrames. Features multi-layered torn paper, archival textures, typewriter typography, and aggressive camera motion."
allowed-tools: Read Write Edit Glob Grep
---

# Kinetic Collage Video: Historical & Geopolitical Motion System

> Specialized skill for generating high-energy **Kinetic Paper Collage**, **Scrapbook Documentary**, and **Geopolitical Explainer Motion Graphics** using Google Flow (Veo 2 / 3.1) and HyperFrames.
> Modeled directly after two top-tier reference productions:
> 1. `videoplayback.mp4`: Indonesian National Independence (1945 / Pejuang / Teks Proklamasi / Peta Nusantara).
> 2. `HISTORICAL-SnapYT.App.mp4`: Modern Geopolitical Conflict (The United States and Iran / Persian Gulf & Strait of Hormuz / Oil Economy / Sanctions).

---

## 1. Visual Anatomy & Universal Metaphors

The *Kinetic Paper Collage* style avoids generic CGI or sterile 3D renders by emulating physical, tactile, hand-crafted archival collage that **adapts dynamically to any topic**:

| Element | Geopolitical / Global (e.g. US-Iran) | Historical / National (e.g. Indonesia 1945) |
| :--- | :--- | :--- |
| **Maps & Geography** | Antique nautical map of Persian Gulf, Strait of Hormuz, European battlefields. | Antique sepia topographic map of Nusantara, spice route channels. |
| **Metaphor Objects** | Oil pressure gauges, US dollar bills, barbed wire, fighter jet silhouettes. | Antique brass clockwork gears, pocket watches, vintage ink pots, keris. |
| **Cutout Figures** | Split-screen national monuments (US Capitol vs Iranian Mosque), world leaders. | Stylized propaganda illustration of freedom fighters in peci and khaki uniform. |
| **Documents & Seals** | Ripped newspaper with stamped headline "CEASEFIRE COLLAPSED", official red ink seals. | Proclamation manuscript draft, masking tape seals, official signatures. |
| **Calendar & Dates** | Flip calendar badge: "February 2026" with blood/ink splatters. | Stamped woodblock badge: "AGUSTUS 1945", "17 AGUSTUS 1945". |
| **Camera Dynamics** | Rapid continuous punch-in, snap pans, 3D paper layer parallax, zero hard cuts. | Rapid continuous punch-in, snap pans, 3D paper layer parallax, zero hard cuts. |

---

## 2. Google Flow (Veo) Prompt Engineering Formula

To generate this exact dynamic motion in Google Flow without visual degradation:

### Master Prompt Blueprint

```text
[SCENE SUBJECT & ACTION]
[COLLAGE & ART MEDIUM]
[TEXTURES & LAYERING]
[MOTION & CAMERA DYNAMICS]
[LIGHTING & COLOR PALETTE]
[AUDIO & SYNCHRONIZATION DIRECTIVE]
```

### Segment 1 (0–10s) Template: The Hook & Map Reveal

```text
Kinetic mixed-media paper-cut collage animation, archival historical documentary style. An antique sepia map of the Indonesian archipelago unfolds with tactile torn paper textures and fibrous edges. Dynamic continuous punch-in camera zoom pushes through layered vintage paper strips. Antique brass clockwork gears rotate smoothly in the background. A folded archival document sealed with masking tape appears, stamped with bold black typewriter letters: "AGUSTUS 1945". High-energy kinetic motion, 24fps filmic motion with subtle stop-motion paper flutter.

Audio: Dramatic cinematic historical orchestral strings with deep resonant percussion, synchronized foley of paper unfolding, typewriter key clatter, and ticking mechanical clockwork.
```

### Segment 2 (10–20s) Template: The Protagonist & Climax (With Native Speech)

> **CRITICAL RULE**: To prevent silent segments or awkward pauses, **every continued segment MUST explicitly state that the narrator speaks and provide dialogue in quotes**, paired with specific physical motion.

```text
Continuous kinetic paper collage animation advancing from the previous scene. The vintage paper center rips open with a dynamic paper-tear transition, revealing a dramatic black-and-white stylized propaganda illustration of a passionate young Indonesian freedom fighter in a khaki uniform and peci hat, raising a clenched fist. Bold typewriter text stamps into the torn paper: "AGUSTUS 1945: DETIK-DETIK MENENTUKAN". The camera executes a rapid forward snap-zoom with kinetic parallax. Red official stamp ink bleeds onto the parchment.

Audio: The dramatic orchestral score intensifies with driving cinematic rhythm, sharp paper-tearing foley, and reverberant room presence.
```

---

## 3. Why Segment 2 Usually Fails & How to Prevent It

When chaining videos in Google Flow (Veo):

1. **The Silent B-Roll Trap**:
   - If a prompt for segment 2 only describes an action (e.g. *"opening the bottle"* or *"looking at the map"*), Veo treats it as a silent B-roll demonstration shot and drops all vocal audio.
   - **Fix**: Always include vocal intent: `The narrator speaks with urgent, clear Indonesian cadence: "..."` or define the explicit acoustic soundscape.

2. **The Repetitive Prompt Bug**:
   - Sending the exact same prompt to segment 2 causes Veo to loop or duplicate segment 1's action.
   - **Fix**: Use progressive scene prompting where segment 2 introduces a new physical reveal (e.g. *center paper rips open*, *camera whip-pans to new document layer*).

3. **Frame-to-Frame Drift**:
   - If aspect ratios or color palettes drift, the chain loses "satu rasa".
   - **Fix**: Always enforce the visual anchor: `Same vintage sepia tones, same torn kraft paper edges, seamless continuation`.

---

## 4. Pre-Packaged Templates for High-Volume Creation

### Template A: Indonesian History / National Narrative (Like `videoplayback.mp4`)
- **Theme**: 17 Agustus 1945 / Peristiwa Rengasdengklok / Sumpah Pemuda.
- **Palette**: Aged parchment cream, sepia brown, charcoal black, vibrant Indonesian crimson red accents.
- **Key Motifs**: Red and white flag torn fabric, Soekarno-Hatta proclamation manuscript, antique compass, pocket watch.

### Template B: True Crime & Mystery Nusantara
- **Theme**: Konspirasi, sejarah kelam, misteri masa lalu.
- **Palette**: Dark desaturated charcoal, cold newspaper gray, blood-red ink splatters, harsh flashlight shadows.
- **Key Motifs**: Red string conspiracy board, taped polaroids, redacted black marker censorship bars, fingerprint ink.

### Template C: Tech / Business Origin Stories
- **Theme**: Dari Garasi Menjadi Raksasa (Startup / Brand documentary).
- **Palette**: Clean blueprint blue, graph paper grids, cardboard cutout logos, neon yellow highlighter marks.
- **Key Motifs**: Circuit boards, stock price graph lines rising, coffee cup rings, stamped patent certificates.

---

## 5. HyperFrames (Code-to-Video) Alternative

When pixel-perfect deterministic typography and exact sound synchronization are required, use the installed HyperFrames suite:

```bash
# Preview the composition in browser
npx hyperframes preview

# Render to deterministic MP4
npx hyperframes render
```

Combine `@skills/hyperframes-keyframes` (for camera zooms and whip-pans) and `@skills/motion-graphics` (for kinetic typewriter titles and SVG paper-tear masks) to create modular video templates without burning API credits.
