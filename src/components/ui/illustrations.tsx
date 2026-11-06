import type { SVGProps } from "react";

/**
 * Hand-drawn style line illustrations in the brand ink, with one orange or lime accent each.
 * Used where a photograph would say nothing new: process steps, legal asides, empty states.
 */

type Props = SVGProps<SVGSVGElement> & { title?: string };

const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 320 240",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 3,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function Svg({ title, children, ...props }: Props) {
  return (
    <svg {...base} role={title ? "img" : "presentation"} aria-label={title} aria-hidden={title ? undefined : true} {...props}>
      {children}
    </svg>
  );
}

/** 01 · A quiz card with one option ticked. */
export function QuizIllustration(props: Props) {
  return (
    <Svg {...props}>
      <path d="M58 44c60-6 128-6 204 2 4 44 4 96-2 148-66 6-136 6-206-2-6-50-6-98 4-148Z" />
      <path d="M84 72h120M84 92h86" strokeOpacity={0.5} />
      <rect x="80" y="112" width="160" height="28" rx="14" />
      <rect x="80" y="150" width="160" height="28" rx="14" fill="#C8F520" stroke="#2B120A" />
      <path d="M212 164l8 8 16-18" stroke="#2B120A" />
      <rect x="80" y="188" width="160" height="28" rx="14" />
      <circle cx="262" cy="52" r="18" fill="#FF5E1A" stroke="none" />
      <path d="M254 52l6 6 10-12" stroke="#2B120A" />
    </Svg>
  );
}

/** 02 · A poster with a destination and two reasons. */
export function PosterIllustration(props: Props) {
  return (
    <Svg {...props}>
      <path d="M48 36c62 4 90-4 112 2 6 56 4 112-2 168-40 4-74 4-112-2-4-58-6-110 2-168Z" fill="#C8F520" stroke="#2B120A" />
      <path d="M70 150c14-26 22-42 34-56 12 14 20 30 34 56M86 150h30M70 170h74" />
      <circle cx="122" cy="76" r="10" fill="#FF5E1A" stroke="none" />
      <path d="M190 72h88M190 92h60M190 128h88M190 148h50" strokeOpacity={0.6} />
      <path d="M178 66l6 6 10-10M178 122l6 6 10-10" stroke="#FF5E1A" />
      <path d="M182 190c30 8 60 8 94 0" strokeDasharray="4 8" />
    </Svg>
  );
}

/** 03 · A receipt split into deposit and balance. */
export function DepositIllustration(props: Props) {
  return (
    <Svg {...props}>
      <path d="M90 40h140v160l-14-10-14 10-14-10-14 10-14-10-14 10-14-10-14 10-14-10-14 10Z" />
      <path d="M112 72h96M112 94h60" strokeOpacity={0.5} />
      <rect x="112" y="112" width="96" height="22" rx="11" fill="#FF5E1A" stroke="none" />
      <rect x="112" y="112" width="30" height="22" rx="11" fill="#2B120A" stroke="none" />
      <path d="M112 152h40M190 152h18" />
      <path d="M244 60c18 10 18 36 0 46M258 48c28 16 28 54 0 70" strokeOpacity={0.5} />
      <circle cx="62" cy="180" r="22" fill="#C8F520" stroke="#2B120A" />
      <path d="M54 180h16M62 172v16" />
    </Svg>
  );
}

/** 04 · A video call: two frames, a tick, nothing stored. */
export function CallIllustration(props: Props) {
  return (
    <Svg {...props}>
      <rect x="40" y="52" width="150" height="110" rx="14" />
      <circle cx="115" cy="98" r="18" />
      <path d="M84 146c8-18 54-18 62 0" />
      <rect x="196" y="108" width="84" height="64" rx="12" fill="#C8F520" stroke="#2B120A" />
      <circle cx="238" cy="132" r="10" />
      <path d="M222 160c4-10 28-10 32 0" />
      <circle cx="212" cy="60" r="22" fill="#FF5E1A" stroke="none" />
      <path d="M202 60l7 7 14-14" stroke="#2B120A" />
      <path d="M52 196h80" strokeOpacity={0.5} />
      <path d="M150 190l14 14M164 190l-14 14" strokeOpacity={0.5} />
      <path d="M176 196h22" strokeOpacity={0.5} />
    </Svg>
  );
}

/** 05 · The circle: a bus with people and a playlist note. */
export function CircleIllustration(props: Props) {
  return (
    <Svg {...props}>
      <path d="M52 92c0-14 10-22 26-22h150c16 0 26 8 26 22v66H52Z" />
      <path d="M52 124h202" strokeOpacity={0.5} />
      <rect x="70" y="84" width="34" height="30" rx="6" /><rect x="118" y="84" width="34" height="30" rx="6" /><rect x="166" y="84" width="34" height="30" rx="6" /><rect x="214" y="84" width="26" height="30" rx="6" />
      <circle cx="87" cy="99" r="6" fill="#FF5E1A" stroke="none" /><circle cx="135" cy="99" r="6" fill="#FF5E1A" stroke="none" /><circle cx="183" cy="99" r="6" fill="#FF5E1A" stroke="none" />
      <circle cx="90" cy="170" r="14" fill="#F5F0E6" /><circle cx="214" cy="170" r="14" fill="#F5F0E6" />
      <path d="M254 48c-16 2-30 2-46 0v34c0 8 12 8 12 0V62l24-2v14c0 8 12 8 12 0Z" fill="#C8F520" stroke="#2B120A" />
      <path d="M28 160c10-8 20-8 30 0" strokeOpacity={0.5} />
    </Svg>
  );
}

/** Legal aside: a stamped document. */
export function TermsIllustration(props: Props) {
  return (
    <Svg {...props}>
      <path d="M84 36h120l36 36v132H84Z" /><path d="M204 36v36h36" />
      <path d="M108 100h92M108 122h92M108 144h60" strokeOpacity={0.5} />
      <circle cx="206" cy="176" r="26" fill="#FF5E1A" stroke="#2B120A" />
      <path d="M194 176l8 8 16-18" stroke="#2B120A" />
      <path d="M56 206c20-6 36-6 54 0" strokeOpacity={0.5} />
    </Svg>
  );
}

/** Privacy aside: a padlock with a crossed-out camera. */
export function PrivacyIllustration(props: Props) {
  return (
    <Svg {...props}>
      <rect x="96" y="104" width="128" height="94" rx="16" fill="#C8F520" stroke="#2B120A" />
      <path d="M124 104V80c0-20 16-34 36-34s36 14 36 34v24" />
      <circle cx="160" cy="148" r="10" fill="#2B120A" stroke="none" /><path d="M160 158v16" />
      <rect x="236" y="56" width="48" height="34" rx="8" /><circle cx="260" cy="73" r="8" />
      <path d="M232 100l56-54" stroke="#FF5E1A" />
    </Svg>
  );
}

/** Refund aside: coins returning along an arrow. */
export function RefundIllustration(props: Props) {
  return (
    <Svg {...props}>
      <path d="M248 80c-20-26-78-30-110-8-38 26-38 78 0 104 32 22 90 18 110-8" />
      <path d="M232 60l16 20-22 10" />
      <ellipse cx="96" cy="124" rx="34" ry="14" fill="#FF5E1A" stroke="#2B120A" />
      <path d="M62 124v24c0 8 15 14 34 14s34-6 34-14v-24" />
      <path d="M62 140c0 8 15 14 34 14s34-6 34-14" strokeOpacity={0.5} />
      <circle cx="236" cy="150" r="18" fill="#C8F520" stroke="#2B120A" /><path d="M230 150h12M236 144v12" />
    </Svg>
  );
}
