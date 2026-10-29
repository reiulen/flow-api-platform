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
> `Single continuous 16:9 widescreen frame. Single camera view. High-end 2D storytime webcomic cartoon illustration in the authentic aesthetic of TheOdd1sOut, OverSimplified, and Dovahhatty with bold black ink contours and cel-shaded digital colors. Vibrant dynamic lighting with atmospheric depth. Characters are charming stylized 2D cartoon bean-head characters: smooth minimalist white cartoon bean head (#FFFFFF), expressive cartoon eyes (dark beads, angry slanted brows, or shocked trembling pupils), expressive cartoon mouth (smiling, yelling wide with teeth/tongue, or deadpan line), curly cartoon hair or historical accessories (laurel wreath, pirate bandana, toga, cloak). Cartoon bean body proportions with white cartoon limbs and period clothing. Cel-shaded with clean thick black ink outlines. Dynamic comedic expressions (smug smirk, passionate shouting, shocked anime despair with sweat drops). Absolutely NO black stick figures, NO stickman limbs, NO realistic human noses, NO photorealistic rendering.`

---

## 3. Template Adegan Berulang

### A. Kamar Tidur Loteng Insula (Subuh)
```text
Single continuous 16:9 widescreen frame, single camera view. High-end 2D digital cartoon illustration, Ancient Footnotes signature aesthetic, clean digital ink outlines, rich digital cel-shading with smooth lighting gradients and tactile material depth. Interior of a cramped ancient Roman insula attic bedroom at dawn. A charming stylized stickman Roman plebeian character with round smooth head (#F4E8D6), simple black dot eyes, and slender black stick limbs waking up on a straw mattress on clay floor. Low dark wooden ceiling beams, a clay oil lamp flickering casting warm golden light gradients across the room, small square window showing morning sky over distant aqueducts. Rich terracotta, sandstone, and warm amber tones. Absolutely NO realistic human nose, NO complex realistic face, NO pencil sketch, NO paper texture, NO comic panels, NO multi-panel, NO split screen, NO borders, no 3D render, no CGI.
```

### B. Perkemahan Militer Romawi di Musim Dingin (Malam Hari)
```text
Single continuous 16:9 widescreen frame, single camera view. High-end 2D digital cartoon illustration, Ancient Footnotes signature aesthetic, clean digital ink outlines, rich digital cel-shading with smooth lighting gradients. Vast ancient Roman military camp at dusk under a deep starry night sky with layered atmospheric depth. Rows of leather legionary tents glowing from within with warm lantern light. In the foreground, charming stylized stickman Roman legionaries with round smooth heads (#F4E8D6), expressive dot eyes, under bronze helmets (galea), wearing authentic segmented armor (lorica segmentata), red tunics, heavy wool cloaks, and military sandals on slender black stick limbs, holding pilum spears and curved red shields (scutum). A glowing iron brazier with crackling fire casts warm orange light gradients onto the snowy ground and wooden watchtower. Absolutely NO realistic human nose, NO complex realistic face, NO pencil sketch, NO colored pencil, NO charcoal hatching, NO rough paper texture, NO comic panels, no 3D CGI.
```

### C. Jalanan Pasar Subura Romawi Kuno (Siang Hari)
```text
Single continuous 16:9 widescreen frame, single camera view. High-end 2D digital cartoon illustration, Ancient Footnotes signature aesthetic, clean digital ink outlines, vibrant digital cel-shading with tactile textures. Bustling ancient Roman Subura street market under bright Mediterranean sunshine. Charming stylized stickman Roman citizens and merchants with smooth round heads (#F4E8D6) and expressive dot eyes on slender black stick limbs wearing authentic colorful draped tunics and togas walking on cobblestones. Vendors selling grain and terracotta amphorae under cloth awnings, tall brick insulae with laundry lines overhead. Warm terracotta and olive palette with smooth atmospheric lighting and dust motes. Absolutely NO realistic human nose, NO complex realistic face, NO pencil sketch, NO comic panels, NO multi-panel grids, NO borders, no 3D render.
```

### D. Pemandian Umum Romawi (Thermae Caldarium)
```text
Single continuous 16:9 widescreen frame, single camera view. High-end 2D digital cartoon illustration, Ancient Footnotes signature aesthetic, clean digital ink outlines, rich digital cel-shading. Interior of an ancient Roman public bathhouse thermae caldarium, arched brick ceiling, large warm water pool with gentle ripples, marble columns with Roman frescoes, soft atmospheric steam rising in warm ambient lighting. Several stylized stickman Roman plebeians with smooth round heads and black stick limbs in the warm pool and resting on stone benches with draped linen towels. Warm terracotta and turquoise pool water palette. Absolutely NO realistic human nose, NO complex realistic face, NO pencil sketch, NO comic panels, NO multi-panel, NO borders, no 3D CGI.
```

---

## 4. Negative Tokens yang Wajib Disematkan
`Avoid: realistic human nose, complex realistic face, photorealistic face, white blank featureless head, pencil sketch, colored pencil, charcoal, graphite hatching, rough paper texture, washed-out colors, flat monochromatic shading, chalk texture, comic panels, comic strip, multi-panel, split screen, grid layout, triptych, comic borders, multiple frames, collage, panel dividers, speech bubbles, 3D CGI render, pixar 3D style, anime, photorealistic modern photograph, blurry watercolor, modern cars, power lines, electricity, modern clothing, plastic skin, deformed hands`
