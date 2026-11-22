/**
 * Whether the camera may leave its framing for a kick (the close-up and the shake). A match
 * always may; the home page's demo holds the camera still while the player is reaching for a
 * control, so the picture behind it stays calm.
 */
let calm = false;

export const closeUpPolicy = {
  isCalm: (): boolean => calm,
  setCalm(next: boolean): void {
    calm = next;
  },
};
