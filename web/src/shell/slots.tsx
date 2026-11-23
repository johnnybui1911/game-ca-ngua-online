import { CreatorBadge } from '../chrome/CreatorBadge';
import { FeedbackButton } from '../chrome/FeedbackButton';
import { SoundButton } from '../audio/SoundControls';
import { LangSwitch } from '../i18n/LangSwitch';

/*
 * The three corner controls of the app shell. The shell positions them (and moves them out of
 * the way of an open panel); each component only renders its control, sized as a 48px target.
 */

/** Top right: the creator's logo. */
export function CreatorLogoSlot() {
  return <CreatorBadge />;
}

/** Bottom right: the feedback entry. A match has none here; its menu carries "Góp ý". */
export function FeedbackSlot() {
  return <FeedbackButton />;
}

/** Top right: the language switch beside the sound toggle. */
export function SoundSlot() {
  return (
    <>
      <LangSwitch />
      <SoundButton />
    </>
  );
}
