(() => {
  'use strict';

  const canvas = document.querySelector('#scene');
  const hud = document.querySelector('#hud');
  const welcome = document.querySelector('#welcome');
  const quickControls = document.querySelector('#quick-controls');
  const status = document.querySelector('#status');
  const startMotionButton = document.querySelector('#start-motion');
  const manualPreviewButton = document.querySelector('#manual-preview');
  const filePicker = document.querySelector('#file-picker');
  const quickPicker = document.querySelector('.quick-picker');
  const recenterButton = document.querySelector('#recenter');
  const reverseButton = document.querySelector('#reverse-motion');
  const fullscreenButton = document.querySelector('#fullscreen');
  const installButton = document.querySelector('#install');
  const toggleControlsButton = document.querySelector('#toggle-controls');

  const MAX_TEXTURE_SIZE = 2048;
  const DEG = 180 / Math.PI;
  const isAndroid = /Android/i.test(navigator.userAgent || '');

  let gl;
  let program;
  let texture;
  let locations;
  let imageAspect = 0.5;
  let targetAngle = 0;
  let displayAngle = 0;
  let previousTime = 0;
  let dragStartX = null;
  let dragStartAngle = 0;
  let pointerMoved = false;
  let suppressCanvasClick = false;
  let motionActive = false;
  let motionSeen = false;
  let neutralAngle = null;
  let lastGravityAngle = null;
  let accumulatedAngle = 0;
  let reverseMotion = false;
  let sensorTimer = 0;
  let statusTimer = 0;
  let welcomeDismissTimer = 0;
  let deferredInstallPrompt = null;
  let currentObjectUrl = null;

  function setStatus(message, duration = 0) {
    window.clearTimeout(statusTimer);
    status.textContent = message;
    status.classList.remove('quiet');
    if (duration > 0) {
      statusTimer = window.setTimeout(() => status.classList.add('quiet'), duration);
    }
  }

  function showExperience() {
    welcome.classList.add('is-dismissed');
    welcome.setAttribute('aria-hidden', 'true');
    window.clearTimeout(welcomeDismissTimer);
    welcomeDismissTimer = window.setTimeout(() => { welcome.hidden = true; }, 310);
    quickControls.hidden = false;
    hud.classList.remove('controls-hidden');
    toggleControlsButton.setAttribute('aria-pressed', 'false');
    toggleControlsButton.setAttribute('aria-label', 'Hide controls');
  }

  function toggleControls() {
    if (!welcome.classList.contains('is-dismissed')) return;
    const hidden = hud.classList.toggle('controls-hidden');
    toggleControlsButton.setAttribute('aria-pressed', String(hidden));
    toggleControlsButton.setAttribute('aria-label', hidden ? 'Show controls' : 'Hide controls');
    if (!hidden) setStatus('Tap the image to hide or show controls.', 1800);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeDegrees(value) {
    return ((value + 180) % 360 + 360) % 360 - 180;
  }

  function isPowerOfTwo(value) {
    return value > 0 && (value & (value - 1)) === 0;
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function createDefaultArtwork() {
    const art = document.createElement('canvas');
    art.width = 1024;
    art.height = 2048;
    const context = art.getContext('2d');
    const background = context.createLinearGradient(0, 0, 1024, 2048);
    background.addColorStop(0, '#11132b');
    background.addColorStop(0.44, '#252457');
    background.addColorStop(1, '#080914');
    context.fillStyle = background;
    context.fillRect(0, 0, art.width, art.height);

    const glow = (x, y, radius, color) => {
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, art.width, art.height);
    };
    glow(818, 300, 630, 'rgba(154,111,255,0.48)');
    glow(130, 1120, 650, 'rgba(54,170,255,0.28)');
    glow(580, 1670, 540, 'rgba(255,100,184,0.18)');

    context.save();
    context.translate(512, 962);
    context.rotate(-0.105);
    context.shadowColor = 'rgba(0,0,0,0.45)';
    context.shadowBlur = 72;
    context.shadowOffsetY = 38;
    roundedRect(context, -318, -510, 636, 1020, 90);
    const frame = context.createLinearGradient(-318, -510, 318, 510);
    frame.addColorStop(0, '#e5ddff');
    frame.addColorStop(0.38, '#a894e8');
    frame.addColorStop(1, '#5c4a9c');
    context.fillStyle = frame;
    context.fill();
    context.shadowColor = 'transparent';
    roundedRect(context, -292, -484, 584, 968, 66);
    const screen = context.createLinearGradient(-290, -450, 290, 470);
    screen.addColorStop(0, '#11142c');
    screen.addColorStop(0.5, '#312b63');
    screen.addColorStop(1, '#101128');
    context.fillStyle = screen;
    context.fill();

    context.save();
    roundedRect(context, -245, -372, 490, 264, 42);
    const card = context.createLinearGradient(-245, -372, 245, -108);
    card.addColorStop(0, 'rgba(255,255,255,0.28)');
    card.addColorStop(1, 'rgba(255,255,255,0.055)');
    context.fillStyle = card;
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.7)';
    context.font = '700 28px system-ui, sans-serif';
    context.fillText('A NEW PERSPECTIVE', -190, -294);
    context.fillStyle = 'rgba(255,255,255,0.54)';
    context.font = '500 19px system-ui, sans-serif';
    context.fillText('tilt to reveal the image', -190, -253);
    context.restore();

    context.fillStyle = '#f8f5ff';
    context.font = '800 128px system-ui, sans-serif';
    context.letterSpacing = '-8px';
    context.fillText('DUO', -214, 15);
    context.letterSpacing = '0px';
    context.fillStyle = 'rgba(225,218,255,0.72)';
    context.font = '650 24px system-ui, sans-serif';
    context.fillText('MOTION EDITION', -132, 63);

    const barGradient = context.createLinearGradient(-214, 145, 214, 145);
    barGradient.addColorStop(0, '#72d8ff');
    barGradient.addColorStop(0.52, '#d0b4ff');
    barGradient.addColorStop(1, '#ff99d2');
    roundedRect(context, -214, 145, 428, 13, 7);
    context.fillStyle = barGradient;
    context.fill();

    roundedRect(context, -214, 214, 428, 186, 34);
    context.fillStyle = 'rgba(255,255,255,0.09)';
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.86)';
    context.font = '700 26px system-ui, sans-serif';
    context.fillText('Make it yours', -166, 280);
    context.fillStyle = 'rgba(255,255,255,0.56)';
    context.font = '500 20px system-ui, sans-serif';
    context.fillText('Choose any photo from your gallery.', -166, 322);
    context.restore();

    context.fillStyle = 'rgba(255,255,255,0.64)';
    context.font = '650 23px system-ui, sans-serif';
    context.textAlign = 'center';
    context.fillText('TILT • UNFOLD • REPEAT', 512, 1862);
    context.fillStyle = 'rgba(255,255,255,0.32)';
    context.font = '500 18px system-ui, sans-serif';
    context.fillText('DUO MOTION', 512, 1906);
    context.textAlign = 'start';
    return art;
  }

  const vertexSource = `
    attribute vec2 a_position;
    attribute vec2 a_uv;
    varying vec2 v_uv;
    void main() {
      v_uv = a_uv;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
    #else
      precision mediump float;
    #endif

    varying vec2 v_uv;
    uniform sampler2D u_image;
    uniform float u_turn;
    uniform float u_side;
    uniform float u_view_aspect;
    uniform vec2 u_cover;

    void main() {
      float turn = clamp(u_turn, 0.0, 1.0);
      float hinge = mix(1.0, 0.0, u_side);
      float fromHinge = abs(v_uv.x - hinge);
      float tilt = turn * 1.57079632679;
      float cosine = max(0.012, cos(tilt));
      float sine = sin(tilt);
      float eyeDistance = 2.65 * max(u_view_aspect, 1.0);
      float depth = fromHinge * u_view_aspect * sine;
      float perspective = eyeDistance / max(eyeDistance - depth, 0.12);
      vec2 imageUv;
      imageUv.x = hinge + (v_uv.x - hinge) * cosine * perspective;
      imageUv.y = 0.5 + (v_uv.y - 0.5) * perspective;
      imageUv = 0.5 + (imageUv - 0.5) * u_cover;

      float edgeSoftness = 0.0025 + 0.022 * sine;
      float verticalMask = smoothstep(-edgeSoftness, edgeSoftness, imageUv.y) *
        (1.0 - smoothstep(1.0 - edgeSoftness, 1.0 + edgeSoftness, imageUv.y));
      vec3 content = texture2D(u_image, clamp(imageUv, 0.001, 0.999)).rgb;
      float shade = sine * pow(fromHinge, 1.45);
      content *= 1.0 - 0.33 * shade;
      float reflection = exp(-pow((fromHinge - 0.68) / 0.27, 2.0)) * sine;
      content += vec3(0.72, 0.68, 1.0) * reflection * 0.045;
      vec3 background = vec3(0.012, 0.014, 0.035);
      gl_FragColor = vec4(mix(background, content, verticalMask), 1.0);
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message || 'Unable to compile the image effect.');
    }
    return shader;
  }

  function createProgram() {
    const vertex = compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    const value = gl.createProgram();
    gl.attachShader(value, vertex);
    gl.attachShader(value, fragment);
    gl.linkProgram(value);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(value, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(value);
      gl.deleteProgram(value);
      throw new Error(message || 'Unable to start the image effect.');
    }
    return value;
  }

  function initialiseWebGL() {
    gl = canvas.getContext('webgl', { alpha: false, antialias: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('This browser does not support the graphics needed for Duo Motion.');
    program = createProgram();
    gl.useProgram(program);
    locations = {
      position: gl.getAttribLocation(program, 'a_position'),
      uv: gl.getAttribLocation(program, 'a_uv'),
      turn: gl.getUniformLocation(program, 'u_turn'),
      side: gl.getUniformLocation(program, 'u_side'),
      viewAspect: gl.getUniformLocation(program, 'u_view_aspect'),
      cover: gl.getUniformLocation(program, 'u_cover'),
    };
    const vertices = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
      -1,  1, 0, 1,
       1, -1, 1, 0,
       1,  1, 1, 1,
    ]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(locations.uv);
    gl.vertexAttribPointer(locations.uv, 2, gl.FLOAT, false, 16, 8);
    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
  }

  function updateTexture(source, width, height) {
    const sourceWidth = Math.max(1, width);
    const sourceHeight = Math.max(1, height);
    let upload = source;
    let uploadWidth = sourceWidth;
    let uploadHeight = sourceHeight;
    const scale = Math.min(1, MAX_TEXTURE_SIZE / Math.max(sourceWidth, sourceHeight));
    if (scale < 1) {
      const resized = document.createElement('canvas');
      resized.width = Math.round(sourceWidth * scale);
      resized.height = Math.round(sourceHeight * scale);
      resized.getContext('2d', { alpha: false }).drawImage(source, 0, 0, resized.width, resized.height);
      upload = resized;
      uploadWidth = resized.width;
      uploadHeight = resized.height;
    }
    imageAspect = uploadWidth / uploadHeight;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, upload);
    const mipmapped = isPowerOfTwo(uploadWidth) && isPowerOfTwo(uploadHeight);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmapped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mipmapped) gl.generateMipmap(gl.TEXTURE_2D);
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function render(time) {
    resize();
    const elapsed = previousTime ? Math.min((time - previousTime) / 1000, 0.08) : 1 / 60;
    previousTime = time;
    const response = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1 - Math.exp(-elapsed * 15);
    displayAngle += (targetAngle - displayAngle) * response;
    if (Math.abs(displayAngle - targetAngle) < 0.02) displayAngle = targetAngle;
    const turn = Math.min(Math.abs(displayAngle) / 180, 1);
    const viewAspect = canvas.width / canvas.height;
    const coverX = Math.min(1, viewAspect / imageAspect);
    const coverY = Math.min(1, imageAspect / viewAspect);

    gl.clearColor(0.012, 0.014, 0.035, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1f(locations.turn, turn);
    gl.uniform1f(locations.side, displayAngle >= 0 ? 1 : 0);
    gl.uniform1f(locations.viewAspect, viewAspect);
    gl.uniform2f(locations.cover, coverX, coverY);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    window.requestAnimationFrame(render);
  }

  function resetCalibration(showMessage = true) {
    neutralAngle = null;
    lastGravityAngle = null;
    accumulatedAngle = 0;
    targetAngle = 0;
    if (showMessage) setStatus('Centered. Lay the phone face-up to calibrate.', 2200);
  }

  function gravityFrom(event) {
    const total = event.accelerationIncludingGravity;
    if (!total || ![total.x, total.y, total.z].every(Number.isFinite)) return null;
    const linear = event.acceleration || {};
    return {
      x: total.x - (Number.isFinite(linear.x) ? linear.x : 0),
      y: total.y - (Number.isFinite(linear.y) ? linear.y : 0),
      z: total.z - (Number.isFinite(linear.z) ? linear.z : 0),
    };
  }

  function onMotion(event) {
    const gravity = gravityFrom(event);
    if (!gravity || Math.hypot(gravity.x, gravity.y, gravity.z) < 1.5) return;
    // Android's x axis is reversed relative to the iPhone prototype this recreates.
    const androidSign = isAndroid ? -1 : 1;
    const physicalAngle = Math.atan2(gravity.x * androidSign, -gravity.z) * DEG;
    if (neutralAngle === null) {
      neutralAngle = physicalAngle;
      lastGravityAngle = physicalAngle;
      accumulatedAngle = 0;
      motionSeen = true;
      showExperience();
      setStatus('Tilt left or right. Tap Center whenever you change position.', 3200);
      return;
    }
    accumulatedAngle = clamp(accumulatedAngle + normalizeDegrees(physicalAngle - lastGravityAngle), -96, 96);
    lastGravityAngle = physicalAngle;
    targetAngle = clamp(accumulatedAngle * 2 * (reverseMotion ? -1 : 1), -180, 180);
    if (!motionSeen) {
      motionSeen = true;
      showExperience();
      setStatus('Motion connected. Tilt gently for the best illusion.', 2400);
    }
  }

  function onOrientation(event) {
    if (motionSeen || !Number.isFinite(event.gamma)) return;
    targetAngle = clamp(event.gamma * 2 * (reverseMotion ? -1 : 1), -180, 180);
  }

  async function enableMotion() {
    showExperience();
    resetCalibration(false);
    if (motionActive) {
      setStatus('Motion is already active. Lay the phone face-up to re-center.', 2400);
      return;
    }
    if (!window.isSecureContext) {
      setStatus('Motion sensors require HTTPS. GitHub Pages will provide it; swipe still works here.', 5000);
    }
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== 'granted') throw new Error('Motion permission was not granted.');
      }
      window.addEventListener('devicemotion', onMotion, { passive: true });
      window.addEventListener('deviceorientation', onOrientation, { passive: true });
      motionActive = true;
      setStatus('Lay the phone face-up, then tilt left or right.', 4200);
      sensorTimer = window.setTimeout(() => {
        if (!motionSeen) setStatus('No sensor data yet. Try moving the phone, or swipe to preview.', 4500);
      }, 2600);
    } catch (error) {
      setStatus(`${error.message || 'Motion could not start.'} You can still swipe to preview.`, 5200);
    }
  }

  function enableManualPreview() {
    showExperience();
    setStatus('Swipe left or right anywhere on the image to preview.', 3500);
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragStartX = event.clientX;
    dragStartAngle = targetAngle;
    pointerMoved = false;
    canvas.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (dragStartX === null) return;
    const distance = event.clientX - dragStartX;
    if (Math.abs(distance) > 8) pointerMoved = true;
    targetAngle = clamp(dragStartAngle + (distance / Math.max(1, canvas.clientWidth)) * 220, -180, 180);
  }

  function onPointerEnd(event) {
    if (dragStartX === null) return;
    suppressCanvasClick = pointerMoved;
    dragStartX = null;
    canvas.releasePointerCapture?.(event.pointerId);
  }

  function loadPhoto(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    const objectUrl = URL.createObjectURL(file);
    currentObjectUrl = objectUrl;
    const image = new Image();
    image.onload = () => {
      updateTexture(image, image.naturalWidth, image.naturalHeight);
      URL.revokeObjectURL(objectUrl);
      if (currentObjectUrl === objectUrl) currentObjectUrl = null;
      showExperience();
      resetCalibration(false);
      setStatus('Photo loaded. Tilt or swipe to unfold it.', 3100);
    };
    image.onerror = () => setStatus('That image could not be opened. Try another photo.', 3800);
    image.src = objectUrl;
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setStatus('Use Chrome’s Add to Home screen option for a full-screen app.', 4000);
    } catch (_) {
      setStatus('Full-screen mode is unavailable here. Add the app to your Home screen instead.', 4200);
    }
  }

  function updateFullscreenLabel() {
    const enabled = Boolean(document.fullscreenElement);
    fullscreenButton.querySelector('span:last-child').textContent = enabled ? 'Exit' : 'Full';
  }

  function updateInstallButton() {
    installButton.hidden = !deferredInstallPrompt;
  }

  async function installApp() {
    if (!deferredInstallPrompt) {
      setStatus('In Chrome, open the menu and choose Add to Home screen.', 4300);
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    updateInstallButton();
  }

  startMotionButton.addEventListener('click', enableMotion);
  manualPreviewButton.addEventListener('click', enableManualPreview);
  filePicker.addEventListener('change', event => loadPhoto(event.target.files?.[0]));
  quickPicker.addEventListener('change', event => loadPhoto(event.target.files?.[0]));
  recenterButton.addEventListener('click', () => resetCalibration(true));
  reverseButton.addEventListener('click', () => {
    reverseMotion = !reverseMotion;
    reverseButton.setAttribute('aria-pressed', String(reverseMotion));
    targetAngle *= -1;
    setStatus(reverseMotion ? 'Motion direction reversed.' : 'Motion direction restored.', 1800);
  });
  fullscreenButton.addEventListener('click', toggleFullscreen);
  installButton.addEventListener('click', installApp);
  toggleControlsButton.addEventListener('click', toggleControls);
  canvas.addEventListener('click', () => {
    if (suppressCanvasClick) {
      suppressCanvasClick = false;
      return;
    }
    if (welcome.classList.contains('is-dismissed') && dragStartX === null) toggleControls();
  });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);
  canvas.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      targetAngle = clamp(targetAngle + (event.key === 'ArrowLeft' ? -24 : 24), -180, 180);
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleControls();
    }
  });
  document.addEventListener('fullscreenchange', updateFullscreenLabel);
  window.addEventListener('orientationchange', () => resetCalibration(false));
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallButton();
    setStatus('Installed. Open Duo Motion from your Home screen anytime.', 4200);
  });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
  }

  try {
    initialiseWebGL();
    const defaultArtwork = createDefaultArtwork();
    updateTexture(defaultArtwork, defaultArtwork.width, defaultArtwork.height);
    window.requestAnimationFrame(render);
    setStatus(isAndroid ? 'Tap Enable tilt, then lay the phone face-up.' : 'Swipe left or right to preview.', 5000);
  } catch (error) {
    document.body.innerHTML = `<p class="noscript">${error.message || 'Duo Motion could not start in this browser.'}</p>`;
  }
})();
