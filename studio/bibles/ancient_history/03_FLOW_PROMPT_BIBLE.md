# Flow Prompt Bible — Nano Banana Pro System

Panduan perakitan prompt untuk menghasilkan latar belakang dan adegan visual sejarah Romawi Kuno menggunakan model **`nano-banana-pro`** di Flow API.

---

## 1. Rumus Struktur Prompt Standar

Setiap prompt yang dikirim ke `nano-banana-pro` wajib mengikuti struktur formula 5 bagian ini:

```text
[STYLE ANCHOR] + [SCENE / SUBJECT] + [LIGHTING & ATMOSPHERE] + [COMPOSITION & RATIO] + [NEGATIVE TOKENS]
```

---

## 2. Token Kunci Pengunci Gaya (*Mandatory Style Anchor*)

Selalu sertakan kalimat pengunci ini di awal setiap prompt gambar:
> `Single continuous 16:9 widescreen frame. Single camera view. Clean 2D minimalist line-art illustration, Rome Unscrolled signature aesthetic, European comic ligne claire architectural style, authentic ancient Roman daily life. Characters are minimalist 2D cartoon stick figures with simple round heads, black dot eyes, and thin clean stick limbs wearing authentic Roman plebeian tunics and togas. Richly detailed architectural backdrops in warm terracotta, Mediterranean sandstone, olive greens, and warm oil lamp amber light. Completely matte texture. Absolutely NO comic book panels, NO multi-panel grids, NO split screens, NO borders.`

---

## 3. Template Adegan Berulang

### A. Kamar Tidur Loteng Insula (Subuh)
```text
Single continuous 16:9 widescreen frame, single camera view. Clean 2D minimalist line-art illustration, Rome Unscrolled aesthetic, European ligne claire architectural style. Interior of a cramped ancient Roman insula attic bedroom at dawn. A minimalist 2D cartoon stick-figure Roman plebeian character with round head, dot eyes, and thin stick limbs waking up on a simple straw mattress on clay floor. Low dark wooden ceiling beams, a clay oil lamp flickering on a rough stool, small square window showing morning sky over distant aqueducts. Warm terracotta, sandstone, and amber tones. Completely matte texture. Absolutely NO comic panels, NO multi-panel, NO split screen, NO borders, no 3D render, no CGI.
```

### B. Jalanan Pasar Romawi Kuno (Siang yang Ramai)
```text
Single continuous 16:9 widescreen frame, single camera view. Clean 2D minimalist line-art illustration, Rome Unscrolled aesthetic, European ligne claire architectural style. Bustling ancient Roman Subura street market. Minimalist 2D cartoon stick-figure Roman characters with simple round cartoon heads, dot eyes, and clean line limbs wearing tunics and togas, walking on basalt cobblestones. Vendors selling grain and amphorae jars under cloth awnings, tall multi-story brick insula buildings with laundry hanging from balconies, warm Mediterranean sunlight, matte finish. Absolutely NO comic panels, NO multi-panel grids, NO borders, no 3D, no anime.
```

### C. Pemandian Umum Romawi (Thermae)
```text
Single continuous 16:9 widescreen frame, single camera view. Clean 2D minimalist line-art illustration, Rome Unscrolled aesthetic. Interior of an ancient Roman public bathhouse thermae caldarium, arched brick ceiling, large warm water pool with gentle ripples, marble columns with Roman frescoes, steam rising gently in warm ambient lighting. Several stylized stick-figure Roman plebeians in pool and on stone benches. Warm terracotta and teal water palette. Absolutely NO comic panels, NO multi-panel, NO split screen, NO borders, no 3D CGI.
```

### D. Villa Bangsawan & Taman Peristyle
```text
Single continuous 16:9 widescreen frame, single camera view. Clean 2D minimalist line-art illustration, Rome Unscrolled aesthetic. Courtyard peristyle garden of a wealthy Roman domus villa, fluted marble columns, central fountain basin with clear water, manicured cypress trees and olive potted plants, mosaic tile flooring, bright open sky, quiet serene atmosphere, clean inked line art, rich architectural detail. A solitary minimalist stick-figure Roman patrician standing in a white toga. Absolutely NO comic panels, NO multi-panel, NO borders, no 3D render.
```

---

## 4. Negative Tokens yang Wajib Disematkan
`Avoid: comic panels, comic strip, multi-panel, split screen, grid layout, triptych, comic borders, multiple frames, collage, panel dividers, speech bubbles, 3D CGI render, pixar 3D style, anime, photorealistic modern photograph, blurry watercolor, modern cars, power lines, electricity, modern clothing, plastic skin, deformed hands`
