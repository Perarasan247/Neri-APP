import { parseChoice } from '../onboardedChoice';

describe('parseChoice', () => {
  it('reads a saved choice', () => {
    expect(parseChoice('{"timezone":"Asia/Kolkata","trackingStartDate":"2026-01-05"}')).toEqual({
      timezone: 'Asia/Kolkata',
      trackingStartDate: '2026-01-05',
    });
  });

  it.each([null, undefined, '', 'not json', '{}', '{"timezone":"Asia/Kolkata"}', '{"timezone":"","trackingStartDate":"2026-01-05"}', '{"timezone":"UTC","trackingStartDate":"5 Jan"}'])(
    'rejects %p',
    (raw) => expect(parseChoice(raw as string | null | undefined)).toBeNull(),
  );
});
