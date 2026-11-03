/** The onboarding answers kept on the device (see onboarded.ts). Pure, so it is easy to test. */
export interface OnboardingChoice {
  timezone: string;
  trackingStartDate: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseChoice(raw: string | null | undefined): OnboardingChoice | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (typeof v?.timezone === 'string' && v.timezone && typeof v?.trackingStartDate === 'string' && ISO_DATE.test(v.trackingStartDate)) {
      return { timezone: v.timezone, trackingStartDate: v.trackingStartDate };
    }
  } catch {}
  return null;
}
