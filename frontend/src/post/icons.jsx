// Thin line icons of the post screens (the design uses no emoji).
const svg = (size, width, children) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const Icon = {
  bell: svg(22, 1.8, <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10 21a2 2 0 0 0 4 0"></path></>),
  check: svg(22, 2.2, <path d="M5 12l5 5L20 7"></path>),
  pin: svg(12, 2.2, <><path d="M12 17v5"></path><path d="M9 3h6l-1 6 4 4H6l4-4z"></path></>),
  refresh: svg(20, 1.8, <><path d="M21 12a9 9 0 1 1-3-6.7L21 8"></path><path d="M21 3v5h-5"></path></>),
  send: svg(22, 2, <><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4z"></path></>),
  plus: svg(24, 2.2, <><path d="M12 5v14"></path><path d="M5 12h14"></path></>),
  back: svg(22, 2, <path d="M15 18l-6-6 6-6"></path>),
  shield: svg(18, 1.9, <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"></path>),
  chevron: svg(16, 2, <path d="M9 6l6 6-6 6"></path>),
  phone: svg(20, 1.9, <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"></path>),
  wrench: svg(22, 1.8, <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"></path>),
  car: svg(22, 1.8, <><path d="M5 17h14v-5l-2-5H7l-2 5z"></path><circle cx="7.5" cy="17" r="1.5"></circle><circle cx="16.5" cy="17" r="1.5"></circle></>),
  alert: svg(22, 1.8, <><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></>),
  reply: svg(18, 2, <><path d="M9 14L4 9l5-5"></path><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></>),
  forward: svg(18, 2, <><path d="M15 14l5-5-5-5"></path><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></>),
  clip: svg(22, 1.8, <path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"></path>),
  camera: svg(24, 1.8, <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="3.5"></circle></>),
  mic: svg(22, 2, <><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0"></path><path d="M12 18v3"></path></>),
  copy: svg(18, 2, <><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></>)
};

export const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
