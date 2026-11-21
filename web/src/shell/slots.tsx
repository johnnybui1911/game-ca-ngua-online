import { SoundButton } from '../audio/SoundControls';

/*
 * The three corner controls of the app shell. The shell positions them (and moves them out of
 * the way of an open panel); each component only renders its control, sized as a 48px target.
 */

/** Top right: the creator's logo. Empty until the branding piece fills it. */
export function CreatorLogoSlot() {
  return null;
}

/** Bottom right: the feedback entry. Empty until the feedback piece fills it. */
export function FeedbackSlot() {
  return null;
}

/** Bottom left: the sound toggle. */
export function SoundSlot() {
  return <SoundButton />;
}
