(() => {
  const panel = document.querySelector('[data-deal-timer]');
  if (!panel) return;

  const duration = 15 * 60 * 1000;
  const storageKey = 'brightwater-demo-vip-deadline-v1';
  const clock = panel.querySelector('[data-countdown]');
  const hours = panel.querySelector('[data-hours]');
  const minutes = panel.querySelector('[data-minutes]');
  const seconds = panel.querySelector('[data-seconds]');
  const message = panel.querySelector('[data-timer-message]');
  const heading = panel.querySelector('.timer-heading');
  const cta = document.querySelector('[data-allocation-cta]');
  const initialMessage = message.textContent;
  const initialCta = cta.textContent;
  let interval;
  let deadline;

  try {
    const saved = Number(sessionStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved > 0 && saved <= Date.now() + duration) {
      deadline = saved;
    }
  } catch {
    // The demo still works when browser storage is unavailable.
  }

  function saveDeadline() {
    try {
      sessionStorage.setItem(storageKey, String(deadline));
    } catch {
      // Keep the deadline in memory for this page visit.
    }
  }

  function update() {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    hours.textContent = String(h).padStart(2, '0');
    minutes.textContent = String(m).padStart(2, '0');
    seconds.textContent = String(s).padStart(2, '0');
    clock.setAttribute('aria-label', `${h} hours, ${m} minutes, ${s} seconds remaining`);
    panel.classList.toggle('is-urgent', remaining > 0 && remaining <= 60);

    if (remaining === 0) {
      clearInterval(interval);
      panel.classList.add('is-expired');
      heading.textContent = 'This demo allocation window has closed';
      message.textContent = 'The simulated hold has expired. No real offer or reservation was made.';
      cta.textContent = 'View demo contact details →';
    } else if (remaining <= 60 && !panel.classList.contains('minute-warning-shown')) {
      panel.classList.add('minute-warning-shown');
      message.textContent = 'Less than a minute left — your simulated VIP hold is about to expire.';
    }
  }

  function start() {
    clearInterval(interval);
    // Update from the actual deadline so background tabs do not pause the countdown.
    interval = setInterval(update, 1000);
    update();
  }

  if (!deadline) {
    deadline = Date.now() + duration;
    saveDeadline();
  }

  panel.querySelector('[data-restart-timer]').addEventListener('click', () => {
    deadline = Date.now() + duration;
    saveDeadline();
    panel.classList.remove('is-expired', 'is-urgent', 'minute-warning-shown');
    heading.textContent = 'Your VIP hold expires in';
    message.textContent = initialMessage;
    cta.textContent = initialCta;
    start();
  });

  panel.hidden = false;
  start();
})();
