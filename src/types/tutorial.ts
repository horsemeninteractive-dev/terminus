export type TutorialStepId =
  | 'choose_hq'
  | 'discover_survivors'
  | 'form_squad'
  | 'scavenge_run'
  | 'survive_first_night'
  | 'completed';

export interface TutorialStepInfo {
  id: TutorialStepId;
  stepNumber: number;
  totalSteps: number;
  title: string;
  shortLabel: string;
  goal: string;
  description: string;
  tacticalDirective: string;
  hint: string;
  iconName: 'Globe' | 'Building' | 'Users' | 'Search' | 'Moon' | 'Award' | 'Eye';
}

export const TUTORIAL_STEPS: Record<TutorialStepId, TutorialStepInfo> = {
  choose_hq: {
    id: 'choose_hq',
    stepNumber: 1,
    totalSteps: 5,
    title: 'ESTABLISH COLONY HEADQUARTERS',
    shortLabel: 'Choose HQ Structure',
    goal: 'Click any real-world building on the 3D map and designate it as Command HQ.',
    description:
      'Explore the sector map and click on a prominent structure footprint. Review its floor area, levels, and defensive rating, then click "ESTABLISH HEADQUARTERS" to claim the site, unlock civilian stockpiles, and house initial survivors.',
    tacticalDirective: 'SELECT A SECURE BUILDING FOOTPRINT TO ANCHOR BASE COMMAND',
    hint: 'Tip: Larger commercial/civic buildings provide greater initial bunkhouse capacity and defense.',
    iconName: 'Building',
  },
  discover_survivors: {
    id: 'discover_survivors', stepNumber: 2, totalSteps: 5,
    title: 'FIND YOUR FIRST SURVIVORS', shortLabel: 'Discover Survivors',
    goal: 'Survey the real-world sector and discover a survivor group.',
    description: 'You begin alone. Survivor groups are not omniscient map markers. Watch for smoke and investigate buildings revealed by your settlement vision. Approach the group and persuade its leader; the leader becomes a named survivor and the rest become general population.',
    tacticalDirective: 'LOCATE HUMAN ACTIVITY AND ESTABLISH FIRST CONTACT',
    hint: 'Chimney smoke is a clue, not a quest marker. Some groups remain hidden until you investigate their building.', iconName: 'Eye',
  },
  form_squad: {
    id: 'form_squad',
    stepNumber: 3,
    totalSteps: 5,
    title: 'ASSEMBLE TACTICAL FIRETEAM',
    shortLabel: 'Form First Squad',
    goal: 'Open the Squads tab in the header and form your first armed combat unit.',
    description:
      'Form an armed squad to protect the perimeter and conduct scavenging sorties. Select an equipped squad leader from your survivors, allocate squad members, and assign weapon loadouts.',
    tacticalDirective: 'ORGANIZE CIVILIAN MILITIA INTO AN ARMED RECONNAISSANCE PATROL',
    hint: 'Tip: Squad leaders with Combat background grant accuracy and suppression buffs.',
    iconName: 'Users',
  },
  scavenge_run: {
    id: 'scavenge_run',
    stepNumber: 4,
    totalSteps: 5,
    title: 'FIRST SCAVENGING SORTIE',
    shortLabel: 'First Scavenge Run',
    goal: 'Select your squad and move it to a nearby building to begin a real scavenging run.',
    description:
      'Select your squad in the HUD or 3D scene, then click a destination on the map. Squads are real world units: they must physically travel to a building before it can be searched. Right-click remains available as an alternative move command.',
    tacticalDirective: 'SWEEP UNLOOTED SECTOR STRUCTURES FOR SURVIVAL PROVISIONS',
    hint: 'Caution: a scavenging squad is exposed while away from HQ. Watch its route, nearby infected and carrying capacity rather than relying on an abstract timed mission.',
    iconName: 'Search',
  },
  survive_first_night: {
    id: 'survive_first_night',
    stepNumber: 5,
    totalSteps: 5,
    title: 'SURVIVE NIGHTFALL INCURSION',
    shortLabel: 'Survive First Night',
    goal: 'Defend against infected activity through dusk and night until Dawn of Day 2.',
    description:
      'At 18:00 (Dusk) infected roaming accelerates, and at 21:00 (Nightfall) a coordinated horde incursion strikes. Station your squads in defensive posture near HQ and survive until 06:00 (Dawn).',
    tacticalDirective: 'REPEL NIGHTFALL HORDE INVASION AND SAFEGUARD COLONY CITIZENS',
    hint: 'Tip: Use the 2X or 4X speed controls in the top bar to advance time when defenses are secure.',
    iconName: 'Moon',
  },
  completed: {
    id: 'completed',
    stepNumber: 5,
    totalSteps: 5,
    title: 'FIRST-TIME PROTOCOL COMPLETE',
    shortLabel: 'Completed',
    goal: 'You have survived the initial deployment and secured the colony foundation.',
    description:
      'You are now equipped to expand survivor population, research advanced technology, trade with distant outposts, and build an enduring civilization in the apocalypse.',
    tacticalDirective: 'COLONY AUTONOMOUS COMMAND AUTHORIZED',
    hint: 'You can replay this tutorial anytime from the header controls.',
    iconName: 'Award',
  },
};
