# Finished-tower collage — design

Date: 2026-09-27. Built while DK was away; approval pending before deploy.

- Where: 명예의 전당 (🏰×N). Open a tower card: "🖼 콜라주 만들기" builds the image, then "📤 콜라주 저장하기" opens the share sheet (or downloads). Two taps, like the backup export, because the share sheet only opens right after a tap.
- A tower topped today already counts in 🏰×N and the shelf (before, it showed up only the next day).
- Image: 1080px wide JPEG, dark background, title (habit, or the couple tower name), dates (couple: both names), 5 columns × 6 rows of 192px photos, floor 1 top-left, each framed in its floor's brick color (the tab's brick skin), floor number badge, "해빗 타워" footer. A couple floor shows both photos side by side. Uses the 360px thumbnails; a photo that won't load leaves its cell dark.
- Code: `collage.js` (canvas, loaded only when used), Shelf button in `ui/windows.js`, wiring in `app.js`, `sw.js` SHELL + CACHE v10.
- Not doing: auto-popup at the 30th floor, custom layouts, sharing to a specific app.
