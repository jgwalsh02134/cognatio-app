/**
 * Full-color medal/award icon (provided artwork). Sized by `className`
 * (e.g. h-5 w-5); its fills are intrinsic, so it ignores text color.
 * Shaped to match the LucideIcon-style `{ className }` prop so it can be
 * dropped into icon slots that expect a component.
 */
export function MedalIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      className={className}
      aria-hidden="true"
    >
      <path fill="#ffeea3" d="M18,16.5c-0.827,0-1.5-0.673-1.5-1.5v-2.5h5V15c0,0.827-0.673,1.5-1.5,1.5H18z" />
      <path fill="#ba9b48" d="M21,13v2c0,0.551-0.449,1-1,1h-2c-0.551,0-1-0.449-1-1v-2H21 M22,12h-6v3c0,1.105,0.895,2,2,2h2 c1.105,0,2-0.895,2-2V12L22,12z" />
      <path fill="#8bb7f0" d="M15.167 14.5L7.5 8.75 7.5 1.5 30.5 1.5 30.5 8.75 22.833 14.5z" />
      <path fill="#4e7ab5" d="M30,2v6.5L22.667,14h-7.333L8,8.5V2H30 M31,1H7v8l8,6h8l8-6V1L31,1z" />
      <path fill="#ffeea3" d="M19 34.534L12.187 38.091 13.465 30.513 7.977 25.132 15.578 24.006 19 17.123 22.422 24.006 30.023 25.132 24.535 30.513 25.813 38.091z" />
      <path fill="#ba9b48" d="M19,18.247l2.857,5.748l0.232,0.468l0.516,0.077l6.349,0.941l-4.584,4.493l-0.373,0.366l0.087,0.515 l1.067,6.329l-5.69-2.971L19,33.97l-0.463,0.242l-5.69,2.971l1.067-6.329l0.087-0.515l-0.373-0.366l-4.584-4.493l6.349-0.941 l0.516-0.077l0.232-0.468L19,18.247 M19,16l-3.753,7.549l-8.339,1.236l6.02,5.902L11.527,39L19,35.098L26.473,39l-1.401-8.313 l6.02-5.902l-8.339-1.236L19,16L19,16z" />
      <g>
        <path fill="#fff" d="M15.167 14.5L11.5 11.75 11.5 1.5 26.5 1.5 26.5 11.75 22.833 14.5z" />
        <path fill="#4e7ab5" d="M26,2v9.5L22.667,14h-7.333L12,11.5V2H26 M27,1H11v11l4,3h8l4-3V1L27,1z" />
      </g>
      <g>
        <path fill="#f78f8f" d="M16.5 1.5H21.5V14.5H16.5z" />
        <path fill="#c74343" d="M21,2v12h-4V2H21 M22,1h-6v14h6V1L22,1z" />
      </g>
      <g>
        <path fill="#f5ce85" d="M19 26A3 3 0 1 0 19 32A3 3 0 1 0 19 26Z" />
      </g>
    </svg>
  );
}
