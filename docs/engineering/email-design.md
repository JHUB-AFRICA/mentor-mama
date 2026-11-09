# MentorMAMA transactional email design

## Direction

The email system uses an adapted MentorMAMA visual language: navy structure,
teal action color, generous white space, restrained borders, live text, and a
single clear next action. The reference supplied for the invitation email
informed the calm, branded composition; the implementation keeps the message
content-first so it remains useful when images are blocked.

## Design rules

- Keep the outer email fluid and the content shell approximately 600px wide.
- Use a single-column reading path for transactional messages.
- Use live text and a plain-text alternative; never make the message depend on
  a hero image or image-embedded copy.
- Left-align multi-line copy and maintain a clear eyebrow → title → body →
  detail → CTA hierarchy.
- Use one primary CTA with a large touch target and a descriptive label.
- Keep role and action personalization in the copy, not in decorative artwork.
- Use semantic heading order, layout-table roles, readable body text, and
  responsive mobile rules.
- Keep safeguarding, confidential feedback, and session free text out of all
  notification payloads and email bodies.

## Implementation status

The current delivery path intentionally sends plain text only. The previous
HTML layout was removed while the visual system and client rendering behavior
are redesigned. Messages retain role-aware invitation copy, clear action URLs,
expiry details, and concise security guidance. No HTML alternative is attached.

The next email-design pass should apply the direction above and then verify
rendering in the Mailtrap sandbox across Gmail, Outlook, and mobile clients.
