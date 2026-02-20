import React from "react";

type LockIconProps = {
  className?: string;
};

export function LockIcon({ className }: LockIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7.75 10V7.5a4.25 4.25 0 0 1 8.5 0V10" />
      <rect x="5.75" y="10" width="12.5" height="10" rx="2.25" />
      <path d="M12 13.6v2.8" />
    </svg>
  );
}
