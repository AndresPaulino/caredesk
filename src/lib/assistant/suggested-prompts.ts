import type { HeroKey } from "../seed/heroes";

/**
 * The four questions an empty thread offers. Each is aimed at a hero resident on the Meadows
 * nurse's units, so the demo login gets a real answer, and the first is the demo script's
 * headline question: the Meadows nurse gets Harold Doe's date, the admin is asked which Doe.
 */
export type SuggestedPrompt = {
  /** The hero the question is about, so a test can check the prompt names them. */
  hero: HeroKey;
  prompt: string;
};

export const SUGGESTED_PROMPTS: readonly SuggestedPrompt[] = [
  { hero: "doe-meadows", prompt: "When was Mr. Doe's last podiatry exam?" },
  {
    hero: "allergy-conflict",
    prompt: "Is Margaret Kowalski allergic to anything she is currently prescribed?",
  },
  {
    hero: "falls",
    prompt: "When was Eugene Barlow's last fall-risk assessment, and is it overdue?",
  },
  { hero: "dementia", prompt: "What is Rose Delgado taking for her dementia?" },
];
