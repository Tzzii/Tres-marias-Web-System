export const LANDING_GUIDE = {
  welcome: {
    title: 'Hi! Planning a celebration?',
    detail: 'Scroll with me. I’ll show you around.'
  },
  packages: {
    title: 'These are our packages.',
    detail: 'Compare setups, guest counts and inclusions for your celebration.'
  },
  gallery: {
    title: 'This is our gallery.',
    detail: 'Explore our celebrations. Open a photo for a closer look.'
  },
  services: {
    title: 'These are our services.',
    detail: 'See how we can help with food, styling and your event.'
  },
  'booking-journey': {
    title: 'Here’s how booking works.',
    detail: 'Follow the steps from choosing a setup to your celebration.'
  },
  availability: {
    title: 'Let’s check your date.',
    detail: 'Choose your event date and check availability here.'
  },
  faq: {
    title: 'Have a few questions?',
    detail: 'Find answers about booking, payments and our packages.'
  },
  'reservation-cta': {
    title: 'Ready to plan your event?',
    detail: 'Start your reservation when you’ve found your setup.'
  },
  contact: {
    title: 'Here’s how to reach us.',
    detail: 'Contact our team for help with your celebration.'
  }
};

/** Follow native scrolling without re-rendering for every pixel or making AI requests. */
export function attachLandingGuide({ sections, onChange, win, doc, Observer = win.ResizeObserver }) {
  let frame = null;
  let stopped = false;
  let previousY = Math.max(0, win.scrollY);
  let navHidden = previousY > 96;
  let previous;

  const update = () => {
    frame = null;
    if (stopped || doc.hidden) return;
    const y = Math.max(0, win.scrollY);
    const delta = y - previousY;
    if (y <= 24) {
      navHidden = false;
      previousY = y;
    } else if (Math.abs(delta) >= 8) {
      navHidden = y > 96 && delta > 0;
      previousY = y;
    }

    const readingLine = Math.min(320, win.innerHeight * 0.36);
    let section = sections[0]?.id || 'welcome';
    for (const element of sections) {
      if (element.getBoundingClientRect().top <= readingLine) section = element.id;
    }
    if (y > 0 && y + win.innerHeight >= doc.documentElement.scrollHeight - 2) {
      section = sections[sections.length - 1]?.id || section;
    }
    if (previous?.section !== section || previous?.navHidden !== navHidden) {
      previous = { section, navHidden };
      onChange(previous);
    }
  };
  const schedule = () => {
    if (!stopped && !doc.hidden && frame === null) frame = win.requestAnimationFrame(update);
  };
  const observer = Observer ? new Observer(schedule) : null;
  sections.forEach((element) => observer?.observe(element));
  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', schedule);
  doc.addEventListener('visibilitychange', schedule);
  schedule();

  return () => {
    stopped = true;
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
    observer?.disconnect();
    win.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule);
    doc.removeEventListener('visibilitychange', schedule);
  };
}
