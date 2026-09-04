/**
 * Campaign transmission content — Chapter I+ radio traffic.
 *
 * Content only: the engine (transmissionService / missionService) materialises
 * these into live transmissions with timestamps, read state and response
 * options. Adding a transmission here requires no engine changes.
 *
 * Radio sources deliberately vary (spec §37): settlement operators, scouts,
 * medical staff, survivors, faction representatives, unknown broadcasts and
 * automated relays — not everything comes from Sgt. Vance.
 */
import { TransmissionDefinition } from '../../types/radioDirective';

export const CAMPAIGN_TRANSMISSIONS: TransmissionDefinition[] = [
  // -------------------------------------------------------------------------
  // CHAPTER I — A PLACE TO LIVE
  // -------------------------------------------------------------------------
  {
    id: 'tx_c1_waterline',
    classification: 'SITREP',
    callsign: 'AUDREY VOSS // CIVIL WATER OPS',
    frequency: '104.20 MHz',
    title: 'WATERLINE — RESERVE PRESSURE DROPPING',
    message:
      'Chief Operator — Voss, municipal water desk. We survived on bottled stores and whatever the sky gives us, but that is not a system. The old mains are dead, the collection is ad-hoc, and if the tap runs dry the whole settlement goes with it. I need you to make water infrastructure real: formal sanitation research, a proper cistern, and a working reserve before we start rationing cups.',
    source: 'Settlement operator',
    priority: 'high',
    audioCue: 'chirp',
  },
  {
    id: 'tx_c1_waterline_done',
    classification: 'MILESTONE',
    callsign: 'AUDREY VOSS // CIVIL WATER OPS',
    title: 'WATERLINE — RESERVE SECURED',
    message:
      'Readings confirm it: the cistern is holding, and the reserve is stable. It is not the old world\'s water grid — but it is ours, and it does not fail when the city does. Good work, Chief.',
    source: 'Settlement operator',
    priority: 'normal',
  },
  {
    id: 'tx_c1_deadchannel',
    classification: 'INTEL',
    callsign: 'UNKNOWN // RELAY GHOST',
    frequency: '88.30 MHz',
    title: 'DEAD CHANNEL — UNREGISTERED TRANSMISSION DETECTED',
    message:
      'An unregistered carrier is bleeding through the relay on a dead band. It is fragmented — loops of numbers, a repeating callsign fragment, then static. Our antenna rig can lock it if we dedicate engineering time to the signal. Whatever is broadcasting, it is not one of ours.',
    source: 'Communications relay',
    priority: 'normal',
    audioCue: 'static',
  },
  {
    id: 'tx_c1_deadchannel_done',
    classification: 'INTEL',
    callsign: 'UNKNOWN // RELAY GHOST',
    title: 'DEAD CHANNEL — SIGNAL INTERCEPTED',
    message:
      'The triangulation resolved. Coordinates locked, origin identified on the sector grid. We still cannot decrypt the payload — but we know where it is coming from now. That is a start.',
    source: 'Communications relay',
    priority: 'normal',
  },
  // -------------------------------------------------------------------------
  // CHAPTER II — THE DEAD AREN\'T RANDOM
  // -------------------------------------------------------------------------
  {
    id: 'tx_c2_nest',
    classification: 'WARNING',
    callsign: 'SGT. VANCE // ADVANCE RECON LEAD',
    title: 'THE NEST — ORGANISED CONTACT REPORTED',
    message:
      'Chief, this is not the usual scatter. Recon has eyes on a structure where the infected are coming FROM — they muster inside, they leave in groups, they return the same way. That is a nest. A lair. Leave it alone and it grows. We need to breach it, clear it, and hold the surrounding streets, or it will keep feeding the night horde.',
    source: 'SZO Network scout',
    priority: 'high',
    audioCue: 'alarm',
  },
  {
    id: 'tx_c2_nest_done',
    classification: 'MILESTONE',
    callsign: 'SGT. VANCE // ADVANCE RECON LEAD',
    title: 'THE NEST — SILENCED',
    message:
      'The structure is quiet. No movement inside, no stir in the radius around it. Whatever was nesting here is gone. The sector reads cleaner than it has in weeks.',
    source: 'SZO Network scout',
    priority: 'normal',
  },
  {
    id: 'tx_c2_nightmove',
    classification: 'EMERGENCY',
    callsign: 'SGT. VANCE // COMMAND HQ',
    title: 'NIGHT MOVEMENT — ENHANCED NOCTURNAL ACTIVITY',
    message:
      'I do not like how tonight is shaping up. The pattern has changed — they are massing earlier and pushing harder, and the sensors say the worst window is just after dusk. This is a survival test, Chief: hold the perimeter through the night, keep the defenders manned, and make sure the colony is still standing at dawn.',
    source: 'SZO Network',
    priority: 'critical',
    audioCue: 'alarm',
  },
  {
    id: 'tx_c2_nightmove_done',
    classification: 'MILESTONE',
    callsign: 'SGT. VANCE // COMMAND HQ',
    title: 'NIGHT MOVEMENT — DAWN HELD',
    message:
      'Dawn is up and the perimeter is intact. We took hits, but we gave worse. Whatever changed in the dark did not break us — and now we know it can be survived.',
    source: 'SZO Network',
    priority: 'normal',
  },
  {
    id: 'tx_c2_oldworld',
    classification: 'DIRECTIVE',
    callsign: 'SCOUT MILLER // FIRETEAM ALPHA',
    title: 'THE OLD WORLD — MEDICAL CACHE LOCATED ON GRID',
    message:
      'Chief, survey has flagged a structure on the satellite grid that could still be holding old-world supplies — a proper medical facility, the kind with sealed cabinets and expiry dates that stopped mattering. If it is unlooted, it is a fortune in antibiotics and surgical stock. Lock the location and put a squad on it before someone else does.',
    source: 'SZO Network scout',
    priority: 'high',
    audioCue: 'chirp',
  },
  {
    id: 'tx_c2_oldworld_done',
    classification: 'MILESTONE',
    callsign: 'SCOUT MILLER // FIRETEAM ALPHA',
    title: 'THE OLD WORLD — CACHE RECOVERED',
    message:
      'The facility is cleared and the cabinets are ours. Sealed stock, intact instruments — the med wing will be eating well for a long time off this haul.',
    source: 'SZO Network scout',
    priority: 'normal',
  },
  // -------------------------------------------------------------------------
  // CHAPTER III — BUILDING SOMETHING THAT LASTS
  // -------------------------------------------------------------------------
  {
    id: 'tx_c3_makingdo',
    classification: 'SITREP',
    callsign: 'FOREMAN REYES // WORKSHOP CREW',
    title: 'MAKING DO — TOOLS ARE FALLING APART',
    message:
      'Chief Operator, Reyes here. The settlement is standing because we have been mending everything by hand, and that is exactly the problem — every day we break more than we can fix. We need a proper tool production line and a stockpile of good tools. No tools, no walls, no repairs, no future. It is that simple.',
    source: 'Settlement operator',
    priority: 'high',
    audioCue: 'chirp',
  },
  {
    id: 'tx_c3_makingdo_done',
    classification: 'MILESTONE',
    callsign: 'FOREMAN REYES // WORKSHOP CREW',
    title: 'MAKING DO — TOOL STOCKPILE READY',
    message:
      'The line is running and the bins are filling. Work that took a day takes an afternoon now. Good call, Chief.',
    source: 'Settlement operator',
    priority: 'normal',
  },
  {
    id: 'tx_c3_scrap',
    classification: 'SITREP',
    callsign: 'FOREMAN REYES // WORKSHOP CREW',
    title: 'SCRAP — WE ARE BURYING OUR OWN RESOURCES',
    message:
      'Every wrecked car, every gutted building, every used cartridge is raw material walking away from us. We need a proper scrap operation — somewhere to pull it apart and turn it back into metal. Waste is a luxury we cannot afford anymore.',
    source: 'Settlement operator',
    priority: 'normal',
    audioCue: 'chirp',
  },
  {
    id: 'tx_c3_scrap_done',
    classification: 'MILESTONE',
    callsign: 'FOREMAN REYES // WORKSHOP CREW',
    title: 'SCRAP — RECYCLING ONLINE',
    message:
      'The yard is running. It is not pretty, but it is honest work: junk goes in, usable metal comes out. Nothing is wasted now.',
    source: 'Settlement operator',
    priority: 'normal',
  },
  {
    id: 'tx_c3_firepower',
    classification: 'DIRECTIVE',
    callsign: 'SGT. VANCE // COMMAND HQ',
    title: 'FIREPOWER — WE SHOOT FASTER THAN WE REPLACE',
    message:
      'Chief, the armoury is the hard limit on everything we do. Every sortie burns ammunition we cannot replace and every night costs us what we cannot spare. We need the arms research and a factory line of our own — ammunition first, then the weapons that fire it. Firepower is independence.',
    source: 'SZO Network',
    priority: 'high',
    audioCue: 'alarm',
  },
  {
    id: 'tx_c3_firepower_done',
    classification: 'MILESTONE',
    callsign: 'SGT. VANCE // COMMAND HQ',
    title: 'FIREPOWER — LINE PRODUCING',
    message:
      'The line is hot and the crates are stacking. We just stopped fighting on borrowed ammunition. That changes everything, Chief.',
    source: 'SZO Network',
    priority: 'normal',
  },
  {
    id: 'tx_c3_power',
    classification: 'WARNING',
    callsign: 'DR. OKAFOR // MEDICAL WING',
    title: 'POWER — THE MEDICAL WING RUNS ON DAYLIGHT',
    message:
      'This is Okafor at the med wing. I am sterilising instruments with boiled water and reading charts by window light. There are drugs that need cold storage and patients who need the machines. We need electrical engineering, a generator, and fuel — or the medicine stops working exactly when it is needed most.',
    source: 'Settlement medical staff',
    priority: 'high',
    audioCue: 'chirp',
  },
  {
    id: 'tx_c3_power_done',
    classification: 'MILESTONE',
    callsign: 'DR. OKAFOR // MEDICAL WING',
    title: 'POWER — THE WING IS ALIVE',
    message:
      'The lights are on. The cold storage is humming. I cannot tell you what it means to a doctor to have a working ward again. Thank you, Chief.',
    source: 'Settlement medical staff',
    priority: 'normal',
  },
  // -------------------------------------------------------------------------
  // CHAPTER IV — PEOPLE
  // -------------------------------------------------------------------------
  {
    id: 'tx_c4_morethan',
    classification: 'MILESTONE',
    callsign: 'MAYOR-ELECT CARVER // CIVIL ADMIN',
    title: 'MORE THAN SURVIVAL — WE ARE A TOWN NOW',
    message:
      'Chief Operator, Carver on the civil desk. Count the beds, count the bowls, count the names on the roster — we are past being a camp. The settlement is big enough to be a community, and communities need more than walls: food that is shared, homes that hold people, medicine that reaches everyone. Time to build for the people we have, not the handful we started with.',
    source: 'Settlement operator',
    priority: 'normal',
    audioCue: 'chirp',
  },
  {
    id: 'tx_c4_morethan_done',
    classification: 'MILESTONE',
    callsign: 'MAYOR-ELECT CARVER // CIVIL ADMIN',
    title: 'MORE THAN SURVIVAL — COMMUNITY SECURED',
    message:
      'Shelter, food, and care for the whole roster. That is not survival anymore, Chief. That is a town that intends to stay.',
    source: 'Settlement operator',
    priority: 'normal',
  },
  {
    id: 'tx_c4_order',
    classification: 'DIRECTIVE',
    callsign: 'MAYOR-ELECT CARVER // CIVIL ADMIN',
    title: 'ORDER — A TOWN NEEDS RULES',
    message:
      'We are too many for good intentions to carry us. There are disputes, there are scarce resources, there are decisions that cannot be made by shouting across the courtyard. Build us a Gathering Place, Chief — a civic hall — and let us start writing the laws we will live by.',
    source: 'Settlement operator',
    priority: 'high',
    audioCue: 'morse',
  },
  {
    id: 'tx_c4_order_done',
    classification: 'MILESTONE',
    callsign: 'MAYOR-ELECT CARVER // CIVIL ADMIN',
    title: 'ORDER — THE FIRST LAWS STAND',
    message:
      'The hall is open and the first laws are written. People are arguing about procedure instead of fighting over rations. That is progress, Chief. Real progress.',
    source: 'Settlement operator',
    priority: 'normal',
  },
  {
    id: 'tx_c4_strangers',
    classification: 'INTEL',
    callsign: 'SCOUT MILLER // FIRETEAM ALPHA',
    title: 'STRANGERS — SURVIVOR GROUP REQUESTING CONTACT',
    message:
      'Chief, we made contact with a group in the eastern blocks — maybe a dozen people, some armed, some not, holding a fortified shopfront. They are asking what we are. They have a radio operator and a few vehicles, but they are running low on food and medicine. The choice is yours: help them outright, bring them in, trade with them, or leave them to their luck. Whatever we decide, they will remember it.',
    source: 'SZO Network scout',
    priority: 'normal',
    audioCue: 'chirp',
  },
  {
    id: 'tx_c4_strangers_help_done',
    classification: 'MILESTONE',
    callsign: 'MAYOR-ELECT CARVER // CIVIL ADMIN',
    title: 'STRANGERS — THE SHOPFRONT GROUP IS OURS',
    message:
      'The eastern group is in. They brought people, skills, and a working radio. We are stronger for it, Chief — and they know who to thank.',
    source: 'Settlement operator',
    priority: 'normal',
  },
  {
    id: 'tx_c4_strangers_trade_done',
    classification: 'MILESTONE',
    callsign: 'SCOUT MILLER // FIRETEAM ALPHA',
    title: 'STRANGERS — TRADE LINE OPEN',
    message:
      'The caravan made the run and the eastern group has what they need. They are talking about setting up a regular route with us. Allies with a trade agreement are worth more than scavengers with a grudge.',
    source: 'SZO Network scout',
    priority: 'normal',
  },
  {
    id: 'tx_c4_strangers_refused',
    classification: 'UPDATE',
    callsign: 'SCOUT MILLER // FIRETEAM ALPHA',
    title: 'STRANGERS — CONTACT CLOSED',
    message:
      'Understood, Chief. We broke contact clean and they did not press. They will remember the answer, though — people like that always do.',
    source: 'SZO Network scout',
    priority: 'low',
  },
  {
    id: 'tx_c4_strangers_recovered',
    classification: 'UPDATE',
    callsign: 'SCOUT MILLER // FIRETEAM ALPHA',
    title: 'STRANGERS — THE EASTERN GROUP IS TALKING AGAIN',
    message:
      'Chief, unexpected development: the eastern operator is back on the band. Whatever bridge we burned, someone on their side is willing to rebuild it. They are not offering friendship — yet — but they are listening. That is more than we had a week ago.',
    source: 'SZO Network scout',
    priority: 'low',
  },
  {
    id: 'tx_c4_bitter',
    classification: 'WARNING',
    callsign: 'SCOUT MILLER // FIRETEAM ALPHA',
    title: 'BITTER HARVEST — THE REFUSED HAVE FOUND PATRONS',
    message:
      'Chief — the shopfront is a burned shell. The eastern group is gone. We clocked their vehicles moving with a raider column before the trail went cold, and then a voice we both recognised came up on the open band: "You left us to die once. We remember." They will drive the night horde ahead of them like a battering ram. Hold the perimeter through the dark, Chief — we have to show them refusing us costs them more than helping ever would.',
    source: 'SZO Network scout',
    priority: 'high',
    audioCue: 'alarm',
  },
  {
    id: 'tx_c4_bitter_done',
    classification: 'MILESTONE',
    callsign: 'SCOUT MILLER // FIRETEAM ALPHA',
    title: 'BITTER HARVEST — THE COLUMN IS BROKEN',
    message:
      'Dawn found the raider column scattered and the voice on the band silent. They learned the cost tonight, Chief — the hard way, the only way they would accept. It is not a victory to celebrate. But the settlement is standing, and that is the whole of the law out here.',
    source: 'SZO Network scout',
    priority: 'normal',
  },
  // -------------------------------------------------------------------------
  // CHAPTER V — THE NETWORK
  // -------------------------------------------------------------------------
  {
    id: 'tx_c5_easternline',
    classification: 'INTEL',
    callsign: 'EASTERN GROUP OPERATOR // TRADE CHANNEL',
    title: 'THE EASTERN LINE — A STANDING OFFER',
    message:
      '— this is the shopfront operator, eastern blocks — you opened the road when it mattered and we remember that too — we are offering a standing line: a supply run on a set route, deliveries both ways, every run you land deepens the trust — the band is open if the offer stands —',
    source: 'Unknown broadcast',
    priority: 'normal',
    audioCue: 'static',
  },
  {
    id: 'tx_c5_easternline_done',
    classification: 'MILESTONE',
    callsign: 'EASTERN GROUP OPERATOR // TRADE CHANNEL',
    title: 'THE EASTERN LINE — RUN COMPLETE',
    message:
      '— cargo counted, route confirmed — you keep the road open and we keep remembering why — next run whenever you are ready, Chief Operator —',
    source: 'Unknown broadcast',
    priority: 'normal',
  },
  {
    id: 'tx_c5_secondchance',
    classification: 'INTEL',
    callsign: 'AUDREY VOSS // CIVIL WATER OPS',
    title: 'SECOND CHANCE — A VIABLE SITE ON THE GRID',
    message:
      'Chief, Voss. Long-range survey turned up a settlement-site candidate — a defensible cluster with its own water source, well outside the pressure we are under here. It is a gamble, but it is the difference between one fragile town and a network that can outlast anything. We would need to prepare logistics properly before committing.',
    source: 'Settlement operator',
    priority: 'high',
    audioCue: 'morse',
  },
  {
    id: 'tx_c5_secondchance_done',
    classification: 'MILESTONE',
    callsign: 'AUDREY VOSS // CIVIL WATER OPS',
    title: 'SECOND CHANCE — THE NETWORK TAKES ROOT',
    message:
      'The new settlement is live and talking to us on the relay. Two towns, one network. We are no longer a single point of failure, Chief. That is the whole game.',
    source: 'Settlement operator',
    priority: 'normal',
  },
  {
    id: 'tx_c5_road',
    classification: 'DIRECTIVE',
    callsign: 'MAYOR-ELECT CARVER // CIVIL ADMIN',
    title: 'THE ROAD — THE COLONY NEEDS SUPPLY LINES',
    message:
      'We have two settlements now, which means we have one supply problem: everything that one town has too much of and the other lacks has to move over open ground. Prepare a proper caravan — loaded, guarded, dispatched — and get the route running. Logistics is what separates a network from two camps.',
    source: 'Settlement operator',
    priority: 'high',
    audioCue: 'chirp',
  },
  {
    id: 'tx_c5_road_done',
    classification: 'MILESTONE',
    callsign: 'MAYOR-ELECT CARVER // CIVIL ADMIN',
    title: 'THE ROAD — CARAVAN COMPLETE',
    message:
      'The cargo is offloaded and the escort is back. The route works. From here on, every town in the network can lean on every other. That is what we have been building toward.',
    source: 'Settlement operator',
    priority: 'normal',
  },
  {
    id: 'tx_c5_voices',
    classification: 'INTEL',
    callsign: 'UNKNOWN // GRAVEL BAND',
    frequency: '112.70 MHz',
    title: 'DISTANT VOICES — ANOTHER OPERATOR ON THE BAND',
    message:
      '— (static) — this is the Gravel Bend settlement, do any station read — (static) — we hold the river loop and we are listening on this band every evening at dusk — (static) — if anyone out there is real, answer when the sun drops —',
    source: 'Unknown broadcast',
    priority: 'normal',
    audioCue: 'static',
  },
  {
    id: 'tx_c5_voices_done',
    classification: 'MILESTONE',
    callsign: 'UNKNOWN // GRAVEL BAND',
    title: 'DISTANT VOICES — CONTACT ESTABLISHED',
    message:
      '— Gravel Bend reads you, Chief Operator. Clear as day on this band. We will hold the frequency. If you ever need a place to run to — or we do — the door is a radio call away.',
    source: 'Unknown broadcast',
    priority: 'normal',
  },
  // -------------------------------------------------------------------------
  // CHAPTER VI — THE WIDER WORLD
  // -------------------------------------------------------------------------
  {
    id: 'tx_c6_military',
    classification: 'INTEL',
    callsign: 'RELAY GHOST // INTERCEPT',
    frequency: '88.30 MHz',
    title: 'WIDER WORLD — STALE MILITARY RELAY RECOVERED',
    message:
      'The dead channel\'s payload finally decoded. It is a military logistics relay — a list of sealed depots and hardened positions, keyed to old grid references. The nearest one is marked as a police station on our satellite layer. Whatever was locked in there is probably still sealed. Someone with a squad and a crowbar could find out.',
    source: 'Communications relay',
    priority: 'high',
    audioCue: 'morse',
  },
  {
    id: 'tx_c6_military_done',
    classification: 'MILESTONE',
    callsign: 'RELAY GHOST // INTERCEPT',
    title: 'WIDER WORLD — DEPOT SECURED',
    message:
      'The cache is open and the inventory is real: ordnance, tools, sealed rations. The old world left more behind than we thought. And now we have a map to the rest of it.',
    source: 'Communications relay',
    priority: 'normal',
  },
];

export const DYNAMIC_TRANSMISSIONS: TransmissionDefinition[] = [
  {
    id: 'tx_dyn_distress',
    classification: 'EMERGENCY',
    callsign: 'UNKNOWN // CIVILIAN CHANNEL',
    title: 'DISTRESS — CIVILIAN GROUP UNDER PRESSURE',
    message:
      '— this is the (unintelligible) group, we are pinned in a building on the sector grid, infected are working the entrances and we are out of water — anyone reading this, please, we need someone to reach us —',
    source: 'Civilian emergency channel',
    priority: 'high',
    audioCue: 'static',
  },
  {
    id: 'tx_dyn_medical',
    classification: 'EMERGENCY',
    callsign: 'DR. OKAFOR // MEDICAL WING',
    title: 'MEDICAL EMERGENCY — SUPPLIES CRITICALLY LOW',
    message:
      'Chief, the cabinet is nearly empty. Bandages, antiseptic, painkillers — we are one bad night away from treating wounds with rags. We need stock from anywhere: a pharmacy on the grid, or the production line, or both. This cannot wait for the next scheduled run.',
    source: 'Settlement medical staff',
    priority: 'high',
    audioCue: 'alarm',
  },
  {
    id: 'tx_dyn_food',
    classification: 'WARNING',
    callsign: 'MAYOR-ELECT CARVER // CIVIL ADMIN',
    title: 'FOOD SHORTAGE — RESERVES BELOW SAFE LINE',
    message:
      'The pantry count is worse than yesterday. We are below the line I refuse to name out loud on an open band. Fields, cookhouse, hunting, scavenging — every option has to be pulling in the same direction right now, or the roster goes hungry.',
    source: 'Settlement operator',
    priority: 'critical',
    audioCue: 'alarm',
  },
  {
    id: 'tx_dyn_lair',
    classification: 'WARNING',
    callsign: 'SGT. VANCE // ADVANCE RECON LEAD',
    title: 'LAIR THREAT — NEW NEST WITHIN REACH',
    message:
      'Chief, recon has eyes on a fresh nest forming inside our operating radius. If it settles in, it will feed the night horde from close range. Hit it while it is still finding its footing.',
    source: 'SZO Network scout',
    priority: 'high',
    audioCue: 'alarm',
  },
  {
    id: 'tx_dyn_power',
    classification: 'WARNING',
    callsign: 'DR. OKAFOR // MEDICAL WING',
    title: 'POWER FAILURE — CRITICAL FACILITIES GOING DARK',
    message:
      'The generator is running dry and the priority loads are starting to flicker. Fuel first — get the reserve up and keep the ward powered. Everything else can wait; the medicine cannot.',
    source: 'Settlement medical staff',
    priority: 'high',
    audioCue: 'alarm',
  },
];