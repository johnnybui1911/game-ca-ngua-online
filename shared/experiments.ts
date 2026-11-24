/** Experiments switched in code, for every room at once; not room settings. */

/**
 * Dice shaping (`worker/rooms/dice-shaping.ts`): a CPU never rolls the same 1 or 6 twice in a row within a turn,
 * and a person with no horse on the track rolls a 1 or 6 after two turns without one. After two 1s or 6s in a row
 * within a turn (any combination) the third roll, for CPU and person alike, is a 2..5. While it is on, the house
 * rule "the third 1 or 6 in a row loses the turn" is off for new games and its "Luật" setting is hidden.
 */
export const DICE_SHAPING = true;
