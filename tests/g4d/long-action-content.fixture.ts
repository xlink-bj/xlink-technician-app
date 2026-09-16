/**
 * Shell-only fixture: enough content to exercise scrolling independently from
 * any backend Appointment schema or production Action definition.
 */
export const longActionContentFixture = Object.freeze(
  Array.from({ length: 36 }, (_, index) => ({
    key: `long-content-${index + 1}`,
    label: `Long content item ${index + 1}`,
  })),
)
