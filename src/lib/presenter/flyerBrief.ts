// Presenter.ai — the flyer brief (Shreesha's preset from Flyer_App_Instruction.md + the room's inputs).
export type FlyerBriefInputs = { name: string; date: string; venue: string; highlights: string[] };

export function flyerInstruction(i: FlyerBriefInputs) {
  return `Build a fully working, mobile-first web app called "Natural Remedies Flyer Studio".

Goal: let an NRPL employee create a professional internal event flyer by entering a few details, choosing a design, and downloading or sharing the finished flyer.

1. Input form, PREFILLED with these details so it can be shown immediately:
- Event name (required): ${i.name}
- Date and time (required): ${i.date}
- Venue (required): ${i.venue}
- Three highlights (required): ${i.highlights.map((h, n) => `(${n + 1}) ${h}`).join(" ")}
- Organiser (optional)
- Logo upload (optional)

2. Branding
- Natural Remedies colours: blue #0066B3, green #6AA132, orange #F26522, yellow #FBB116, on a white background.
- Roboto font (Google Fonts), with a clean sans-serif fallback.
- Official logo: load it by default from https://www.simplenow.ai/flyer/nrpl-logo.png (set img.crossOrigin = "anonymous" BEFORE setting src, so the canvas can still export a PNG). An uploaded logo replaces it. Place the logo on white only, about 150 to 200 px tall on the canvas. Never draw or recreate the logo; if it fails to load, show the text "Natural Remedies".
- Good contrast; all text readable.

3. Three layouts, selectable, and the preview updates instantly: Corporate (clean, formal, structured), Celebration (colourful and energetic), Minimal (generous white space).

4. Live preview: portrait 4:5, updates as the user types. Long names and highlights must shrink or wrap, never overflow or disappear. Render the flyer on a <canvas> of 1080 x 1350 so the preview and the download are identical.

5. Buttons: Download PNG, Share, Reset.
- Download PNG creates a real 1080 x 1350 image of the flyer.
- Share uses navigator.share with the image file where supported. Otherwise, download the PNG and open https://wa.me/?text=... with a ready message, telling the user to attach the image.

6. Technical
- Works on Android and iPhone browsers; touch targets at least 44 px; no horizontal scrolling at 360 px width.
- No login, backend, database, payments or external APIs (Google Fonts is the only allowed external request). Nothing stored.
- Validate required fields with clear error messages.

QUALITY BAR (this is shown live to an audience):
- The flyer must look professionally designed and FILL the 1080 x 1350 canvas: event name at 80 to 110 px bold, details at 40 to 50 px, highlights at 36 to 44 px, coloured bands or shapes in the brand colours, generous margins (80 px). Never leave the lower half empty.
- Each of the 3 layouts must look clearly different.
- Wait for the Roboto font to load (document.fonts.load) before drawing; redraw on every input.
- Style the form too: rounded inputs at least 44 px tall, 16 px text, brand-blue primary buttons, layout chosen with 3 large toggle buttons, three separate highlight inputs.

OUTPUT FORMAT: reply with ONE complete, self-contained HTML document (inline CSS and JS), starting with <!doctype html> and ending with </html>. No explanation, no markdown fences. Prioritise working buttons over decoration.`;
}

