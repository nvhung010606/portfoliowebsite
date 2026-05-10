(() => {
  const root = document.documentElement;
  const STORAGE_KEY = "ln-theme";

  // --- Theme: system preference by default, user choice persisted
  const stored = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initial = stored || (prefersDark ? "dark" : "light");
  applyTheme(initial);

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    const btn = document.getElementById("themeToggle");
    if (btn) btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  }

  document.getElementById("themeToggle")?.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  });

  // React to system theme changes only if user hasn't made an explicit choice
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) applyTheme(e.matches ? "dark" : "light");
  });

  // --- Nav shadow/border on scroll
  const nav = document.querySelector(".nav");
  const onScroll = () => {
    if (!nav) return;
    nav.classList.toggle("is-scrolled", window.scrollY > 8);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // --- Reveal on scroll
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const revealTargets = document.querySelectorAll(
    ".hero__inner, .section__head, .section__body, .role-card, .edu-card, .skill-card, .contact-card"
  );
  revealTargets.forEach((el) => el.classList.add("reveal"));

  if (!reducedMotion && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
    );
    revealTargets.forEach((el) => observer.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add("is-in"));
  }

  // --- Footer year
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // --- Custom GitHub cursor over .work-card
  initWorkCardCursor();

  function initWorkCardCursor() {
    const cards = document.querySelectorAll(".work-card");
    if (!cards.length) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const cursor = document.createElement("div");
    cursor.className = "gh-cursor";
    cursor.setAttribute("aria-hidden", "true");
    cursor.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>' +
      "</svg>";
    document.body.appendChild(cursor);

    const SIZE = 64;
    let activeCard = null;

    // Position the cursor every mousemove — direct, no rAF, no lerp.
    // CSS handles the visual smoothing via `transition: transform`.
    document.addEventListener("mousemove", (e) => {
      cursor.style.left = (e.clientX - SIZE / 2) + "px";
      cursor.style.top = (e.clientY - SIZE / 2) + "px";

      const card = e.target instanceof Element ? e.target.closest(".work-card") : null;
      if (card) {
        if (activeCard !== card) {
          if (activeCard) activeCard.classList.remove("is-cursor-active");
          activeCard = card;
          activeCard.classList.add("is-cursor-active");
          cursor.classList.add("is-visible");
        }
      } else if (activeCard) {
        activeCard.classList.remove("is-cursor-active");
        activeCard = null;
        cursor.classList.remove("is-visible");
      }
    });

    document.addEventListener("mouseleave", () => {
      if (activeCard) {
        activeCard.classList.remove("is-cursor-active");
        activeCard = null;
      }
      cursor.classList.remove("is-visible");
    });
  }

  // --- Momentum (inertia) scrolling
  // Wheel/trackpad input feeds a target Y; an rAF loop eases the actual scroll
  // toward that target with a cubic-bezier-shaped curve. Native touch scrolling
  // on mobile is left alone — it already has system inertia.
  initMomentumScroll();

  function initMomentumScroll() {
    if (reducedMotion) return;
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    if (isCoarsePointer) return; // mobile/tablet: keep native momentum

    // Tunables
    const LERP = 0.025;           // base interpolation factor per frame (60fps) — lower = more friction
    const WHEEL_MULTIPLIER = 0.3; // how much wheel delta moves the target — lower = slower
    const LINE_HEIGHT = 16;       // for deltaMode === 1 (lines)
    const PAGE_HEIGHT = () => window.innerHeight * 0.9; // deltaMode === 2 (pages)
    const STOP_THRESHOLD = 0.4;   // px — snap when close enough
    // Cubic-bezier(0.22, 1, 0.36, 1) — same easing as the rest of the site
    const ease = bezier(0.22, 1, 0.36, 1);

    let targetY = window.scrollY;
    let currentY = targetY;
    let rafId = null;
    let programmatic = false;
    let lastFrame = performance.now();

    const maxScroll = () =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    const clamp = (v) => Math.min(Math.max(v, 0), maxScroll());

    function tick(now) {
      const dt = Math.min(64, now - lastFrame); // cap dt to avoid jumps after tab blur
      lastFrame = now;
      // Frame-rate-independent lerp; on 60fps -> ~LERP per frame.
      const t = 1 - Math.pow(1 - LERP, dt / (1000 / 60));
      // Apply easing to the t for a more natural deceleration tail.
      const eased = ease(t);
      const diff = targetY - currentY;

      if (Math.abs(diff) < STOP_THRESHOLD) {
        currentY = targetY;
        programmatic = true;
        window.scrollTo(0, currentY);
        programmatic = false;
        rafId = null;
        return;
      }

      currentY += diff * eased;
      programmatic = true;
      window.scrollTo(0, currentY);
      programmatic = false;
      rafId = requestAnimationFrame(tick);
    }

    function start() {
      if (rafId != null) return;
      lastFrame = performance.now();
      rafId = requestAnimationFrame(tick);
    }

    function onWheel(e) {
      // Let pinch-zoom and modifier-driven gestures pass through.
      if (e.ctrlKey || e.metaKey) return;
      // Respect inner scrollables (e.g. modals). If an ancestor can scroll, bail.
      if (eventInsideScrollable(e.target, e.deltaY)) return;

      e.preventDefault();

      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= LINE_HEIGHT;
      else if (e.deltaMode === 2) delta *= PAGE_HEIGHT();

      targetY = clamp(targetY + delta * WHEEL_MULTIPLIER);
      start();
    }

    // Sync target when scroll happens from outside our loop (scrollbar drag,
    // keyboard, anchor-link, browser restore, etc.)
    function onScrollSync() {
      if (programmatic) return;
      targetY = window.scrollY;
      currentY = window.scrollY;
    }

    function onResize() {
      targetY = clamp(targetY);
      currentY = clamp(currentY);
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onScrollSync, { passive: true });
    window.addEventListener("resize", onResize);
  }

  // Walks up from the wheel target; if any ancestor is itself scrollable in the
  // direction of the gesture, we let the browser handle it natively.
  function eventInsideScrollable(target, deltaY) {
    let el = target instanceof Element ? target : null;
    while (el && el !== document.body && el !== document.documentElement) {
      const style = getComputedStyle(el);
      const overflowY = style.overflowY;
      const canScroll =
        (overflowY === "auto" || overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight;
      if (canScroll) {
        const atTop = el.scrollTop <= 0;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if ((deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)) return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  // Standard cubic-bezier(p1x, p1y, p2x, p2y) — returns y for a given t in [0, 1].
  // Newton-Raphson then bisection fallback to invert x(t).
  function bezier(p1x, p1y, p2x, p2y) {
    const NEWTON_ITERATIONS = 4;
    const NEWTON_MIN_SLOPE = 0.001;
    const SUBDIVISION_PRECISION = 1e-7;
    const SUBDIVISION_MAX_ITERATIONS = 10;

    const A = (a1, a2) => 1.0 - 3.0 * a2 + 3.0 * a1;
    const B = (a1, a2) => 3.0 * a2 - 6.0 * a1;
    const C = (a1) => 3.0 * a1;
    const calcBezier = (t, a1, a2) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
    const getSlope = (t, a1, a2) => 3.0 * A(a1, a2) * t * t + 2.0 * B(a1, a2) * t + C(a1);

    function getTForX(x) {
      let t = x;
      for (let i = 0; i < NEWTON_ITERATIONS; i++) {
        const slope = getSlope(t, p1x, p2x);
        if (slope < NEWTON_MIN_SLOPE) break;
        const cx = calcBezier(t, p1x, p2x) - x;
        t -= cx / slope;
      }
      // Bisection fallback
      let lo = 0, hi = 1;
      t = Math.min(1, Math.max(0, t));
      for (let i = 0; i < SUBDIVISION_MAX_ITERATIONS; i++) {
        const cx = calcBezier(t, p1x, p2x);
        if (Math.abs(cx - x) < SUBDIVISION_PRECISION) return t;
        if (cx < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return t;
    }

    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      return calcBezier(getTForX(x), p1y, p2y);
    };
  }
})();
