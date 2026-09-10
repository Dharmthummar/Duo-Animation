# Duo Motion

An Android-first, installable web app that recreates a sensor-controlled folding-image illusion. It is a static site: no accounts, build step, uploads, or server are required.

## Use on Android

1. Open the deployed page in Chrome over HTTPS.
2. Tap **Enable tilt** and lay the phone face-up to calibrate.
3. Tilt gently left or right. Use **Center** after moving to a new position.
4. Use **Photo** to load an image from the device. The photo remains in the browser on that device.

Swipe horizontally to preview the effect whenever motion data is unavailable. The **Reverse** control changes the direction if a particular Android model reports its sensor axes differently.

## Publish with GitHub Pages

After the project is pushed to a GitHub repository:

1. Open the repository’s **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and the `/(root)` folder, then save.

GitHub Pages serves the site over HTTPS, which is required for Android motion sensors and the installable web-app experience.

## Files

- `index.html` — app shell and controls
- `app.js` — WebGL folding effect, Android motion sensing, touch fallback, photo loader, and PWA install prompt
- `styles.css` — mobile-first visual design and safe-area handling
- `manifest.webmanifest` and `sw.js` — installability and offline app shell
