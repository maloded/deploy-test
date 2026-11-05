import type { RequestType } from "@/lib/request-types";

/**
 * The small line icons of the footer's contact links: one stroke in the text colour (currentColor), round ends, the same weight as the fact icons. Decorative:
 * the link's text says what it is. `type` is a request type; "mail" is the e-mail address and "phone" the phone number.
 */
const PATHS: Record<RequestType | "mail" | "phone", React.ReactNode> = {
  question: (
    <>
      <path d="M4 5.5h16v10H12l-4 3.5v-3.5H4z" />
      <path d="M10 9.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9" />
      <path d="M12 13.2h.01" />
    </>
  ),
  offer: (
    <>
      <path d="M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7z" />
      <path d="M7.8 8.2h.01" />
    </>
  ),
  viewing: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="1.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  testdrive: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 4v6M5.2 15.5 10.2 13M18.8 15.5 13.8 13" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  phone: <path d="M7.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 5.5 5.5a2 2 0 0 1 2-2z" />,
};

export function FooterIcon({ name }: { name: RequestType | "mail" | "phone" }) {
  return (
    <svg className="site-footer__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
