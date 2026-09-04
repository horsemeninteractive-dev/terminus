import React, { useEffect, useMemo, useState } from 'react';
import {
 AlertTriangle,
 FolderOpen,
 Settings as SettingsIcon,
 Info,
 BookOpen,
 Map,
 Wrench,
 Gamepad2,
 Music,
 Image as ImageIcon,
 ExternalLink,
 ChevronRight,
 X,
} from 'lucide-react';
import { SaveGameMeta } from '../types/saveGame';
import { saveService } from '../services/saveService';
import { soundService } from '../services/soundService';
import { IFZ_IMAGES } from '../assets/images';
import { DynamicAtmosphericBackground } from './DynamicAtmosphericBackground';
import { TerminusLogo } from './TerminusLogo';

// Pull the real changelog into the UPDATES extras modal so the in-game
// readout is always the actual CHANGELOG.md, never a stale hand-written blurb.
import changelogRaw from '../../CHANGELOG.md?raw';

type ChangelogItem = { kind: 'bullet' | 'note'; text: string };
interface ChangelogCategory { name: string; items: ChangelogItem[]; }
interface ChangelogRelease {
  title: string;
  date: string;
  intro: ChangelogItem[];
  categories: ChangelogCategory[];
}

// Tokenize one inline segment: `code`, **bold**, *italic* — in that order.
function inlineMarkup(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  let t = 0;
  for (const tok of tokens) {
    if (!tok) continue;
    const k = t++;
    if (tok.startsWith('`') && tok.endsWith('`')) {
      parts.push(<code key={k} className="text-[#7DD3FC] bg-white/5 px-1 rounded">{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith('**') && tok.endsWith('**')) {
      parts.push(<strong key={k} className="text-[#E8E8E8]">{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('*') && tok.endsWith('*')) {
      parts.push(<em key={k} className="italic text-[#A5B4FC]">{tok.slice(1, -1)}</em>);
    } else {
      parts.push(<span key={k}>{tok}</span>);
    }
  }
  return parts;
}

/**
 * Parse the changelog subset we write into releases → categories → items.
 * Bullet continuation lines (wrapped markdown) fold back into their bullet so
 * each entry renders as one readable paragraph instead of many stray lines.
 */
function parseChangelog(md: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let current: ChangelogRelease | null = null;
  let currentCat: ChangelogCategory | null = null;
  let blankPending = false;

  const target = (): ChangelogItem[] =>
    currentCat ? currentCat.items : current ? current.intro : [];
  const append = (item: ChangelogItem) => target().push(item);

  for (const raw of md.split('\n')) {
    const line = raw.trim();
    // Skip definition footnotes ([0.2.0]: https://...).
    if (/^\[[^\]]+\]:/.test(line)) continue;
    if (line.startsWith('## ')) {
      const title = line.slice(3).trim().replace(/^\[([^\]]+)\]/, '$1');
      const m = title.match(/^(\S+)\s*[–-]\s*(.+)$/);
      current = { title: m ? m[1] : title, date: m ? m[2] : '', intro: [], categories: [] };
      releases.push(current);
      currentCat = null;
      blankPending = false;
      continue;
    }
    if (!current) continue; // skip preamble until the first release heading
    if (line.startsWith('### ')) {
      currentCat = { name: line.slice(4).trim(), items: [] };
      current.categories.push(currentCat);
      blankPending = false;
      continue;
    }
    if (line === '---' || !line) {
      blankPending = !line;
      continue;
    }
    const items = target();
    const last = items[items.length - 1];
    if (line.startsWith('- ')) {
      append({ kind: 'bullet', text: line.slice(2) });
    } else if (last && !blankPending && last.kind === 'note') {
      // continuation of a plain (non-bulleted) paragraph
      last.text += ' ' + line;
    } else if (last && !blankPending && last.kind === 'bullet') {
      // wrapped continuation of a bullet entry
      last.text += ' ' + line;
    } else {
      append({ kind: 'note', text: line });
    }
    blankPending = false;
  }
  return releases.filter((r) => r.intro.length > 0 || r.categories.length > 0);
}

const CATEGORY_ACCENTS: Record<string, string> = {
  Added: 'border-[#22C55E]/60 text-[#4ADE80]',
  Changed: 'border-[#38BDF8]/60 text-[#7DD3FC]',
  Fixed: 'border-[#EF4444]/60 text-[#F87171]',
  Deprecated: 'border-[#FACC15]/60 text-[#FDE047]',
  Removed: 'border-[#EF4444]/60 text-[#F87171]',
  Security: 'border-[#A78BFA]/60 text-[#C4B5FD]',
};

/** Split a bullet into its bold lead summary and the remaining detail. */
function splitEntry(text: string): { lead: string; rest: string } {
  const m = text.match(/^(\*\*[^*]+\*\*)/);
  if (m) return { lead: m[1], rest: text.slice(m[1].length).trim() };
  return { lead: '', rest: text };
}

const entryKey = (cat: string, i: number) => `${cat}::${i}`;

/** Structured, readable rendering of the release notes with version tabs. */
function ChangelogReleaseNotes() {
  const releases = useMemo(() => parseChangelog(changelogRaw), []);
  const [activeIdx, setActiveIdx] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const active = releases[Math.min(activeIdx, releases.length - 1)];
  if (!releases.length) return null;

  const toggle = (k: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const switchVersion = (i: number) => {
    setActiveIdx(i);
    setExpanded(new Set());
  };

  const expandAll = () => {
    const all = new Set<string>();
    for (const cat of active.categories) {
      cat.items.forEach((item, i) => {
        if (item.kind === 'bullet' && splitEntry(item.text).rest) all.add(entryKey(cat.name, i));
      });
    }
    setExpanded(all);
  };

  const collapseAll = () => setExpanded(new Set());
  const bulletCount = active.categories.reduce(
    (n, c) => n + c.items.filter((it) => it.kind === 'bullet').length,
    0
  );
  const allOpen = bulletCount > 0 && expanded.size >= bulletCount;

  return (
    <div>
      {/* Version tabs + expand controls: newest release first */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="font-heading font-bold text-[#EF4444] text-[11px] uppercase tracking-wider mr-1">
          RELEASE NOTES
        </span>
        {releases.map((r, i) => (
          <button
            key={r.title}
            onClick={() => switchVersion(i)}
            className={`px-2.5 py-1 text-[10px] font-heading uppercase tracking-wider border clip-tactical-bracket transition-colors ${
              i === activeIdx
                ? 'bg-[#B31217] border-[#EF4444] text-white'
                : 'bg-[#14171C] border-[#262F3D] text-[#8C9BAE] hover:text-white hover:border-[#8C9BAE]'
            }`}
          >
            v{r.title}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={expandAll}
            disabled={allOpen}
            className="px-2 py-1 text-[9px] font-heading uppercase tracking-wider border border-[#262F3D] text-[#8C9BAE] hover:text-white hover:border-[#8C9BAE] disabled:opacity-40 disabled:cursor-default disabled:hover:text-[#8C9BAE] disabled:hover:border-[#262F3D] clip-tactical-bracket transition-colors"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            disabled={expanded.size === 0}
            className="px-2 py-1 text-[9px] font-heading uppercase tracking-wider border border-[#262F3D] text-[#8C9BAE] hover:text-white hover:border-[#8C9BAE] disabled:opacity-40 disabled:cursor-default disabled:hover:text-[#8C9BAE] disabled:hover:border-[#262F3D] clip-tactical-bracket transition-colors"
          >
            Collapse
          </button>
        </div>
      </div>

      <div className="max-h-[52vh] overflow-y-auto pr-1.5 space-y-3">
        <div className="flex items-baseline gap-2">
          <div className="font-heading font-bold text-sm text-[#E8E8E8]">Version {active.title}</div>
          {active.date && (
            <div className="text-[10px] font-tech text-[#8C9BAE] uppercase tracking-widest">
              Released {active.date}
            </div>
          )}
        </div>

        {active.intro.length > 0 && (
          <div className="text-[#A6B3C4] text-[11px] leading-relaxed pl-1">
            {active.intro.map((n, i) => (
              <p key={i} className={i > 0 ? 'mt-1' : ''}>{inlineMarkup(n.text)}</p>
            ))}
          </div>
        )}

        {active.categories.map((cat) => {
          const accent = CATEGORY_ACCENTS[cat.name] || 'border-[#8C9BAE]/40 text-[#A6B3C4]';
          return (
            <div key={cat.name}>
              <div className={`flex items-center gap-1.5 mb-1.5 border-l-2 pl-2 font-heading font-bold text-[10px] uppercase tracking-[0.15em] ${accent}`}>
                {cat.name}
                <span className="text-[#5B6B7C] font-normal tracking-normal">({cat.items.length})</span>
              </div>
              <div className="space-y-2">
                {cat.items.map((item, i) => {
                  if (item.kind === 'note') {
                    return (
                      <p key={i} className="text-[#8C9BAE] text-[11px] leading-relaxed pl-1">
                        {inlineMarkup(item.text)}
                      </p>
                    );
                  }
                  const key = entryKey(cat.name, i);
                  const isOpen = expanded.has(key);
                  const { lead, rest } = splitEntry(item.text);
                  // A bullet that is entirely bold has nothing to hide.
                  if (!rest) {
                    return (
                      <div key={i} className="flex gap-1.5 pl-1">
                        <span className="text-[#B31217] shrink-0 leading-snug">▸</span>
                        <p className="text-[#A6B3C4] text-[11px] leading-relaxed min-w-0">{inlineMarkup(item.text)}</p>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={i}
                      onClick={() => toggle(key)}
                      title={isOpen ? 'Click to collapse' : 'Click to expand'}
                      className={`w-full text-left flex gap-1.5 pl-1 pr-1.5 py-1 -my-1 rounded-sm transition-colors ${
                        isOpen ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <span
                        className={`text-[#B31217] shrink-0 leading-snug mt-px transition-transform duration-150 ${
                          isOpen ? 'rotate-90' : ''
                        }`}
                      >
                        ▸
                      </span>
                      <span className="min-w-0 text-[11px] leading-relaxed">
                        {isOpen ? (
                          lead ? (
                            <>
                              {inlineMarkup(lead)}
                              <span className="text-[#A6B3C4]"> {inlineMarkup(rest)}</span>
                            </>
                          ) : (
                            <span className="text-[#A6B3C4]">{inlineMarkup(rest)}</span>
                          )
                        ) : lead ? (
                          <>
                            {inlineMarkup(lead)}
                            <span className="text-[#5B6B7C] text-[10px] uppercase tracking-wider ml-1">… expand</span>
                          </>
                        ) : (
                          <>
                            <span className="line-clamp-2 text-[#A6B3C4]">{inlineMarkup(rest)}</span>
                            <span className="text-[#5B6B7C] text-[10px] uppercase tracking-wider ml-1">… expand</span>
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MainMenuProps {
 onContinue: () => void;
 onNewGame: () => void;
 onOpenLoadGame?: () => void;
 onLoadGame?: () => void;
 onOpenCodex?: () => void;
 onOpenSettings?: () => void;
 onOpenCredits?: () => void;
 onQuickStartPreset?: (presetId: string) => void;
 hasExistingSave?: boolean;
 latestSave?: SaveGameMeta | null;
}

export const MainMenu: React.FC<MainMenuProps> = ({
 onContinue,
 onNewGame,
 onOpenLoadGame,
 onLoadGame,
 onOpenCodex,
 onOpenSettings,
 onOpenCredits,
 hasExistingSave,
 latestSave: initialLatestSave,
}) => {
 const [latestSave, setLatestSave] = useState<SaveGameMeta | null>(initialLatestSave || null);
 const [activeMenuHover, setActiveMenuHover] = useState<string | null>(null);
 const [showExtrasSubmenu, setShowExtrasSubmenu] = useState<boolean>(false);
 const [activeExtrasModal, setActiveExtrasModal] = useState<string | null>(null);
 const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
 const [showFeedbackModal, setShowFeedbackModal] = useState<boolean>(false);
 const [feedbackText, setFeedbackText] = useState<string>('');
 const [feedbackSent, setFeedbackSent] = useState<boolean>(false);

 useEffect(() => {
 const save = initialLatestSave || saveService.getLatestSave();
 setLatestSave(save);
 }, [initialLatestSave]);

 const handleMenuHover = (id: string) => {
 setActiveMenuHover(id);
 soundService.playCombatActionSFX('assault_order');
 };

 const handleMenuClick = (action?: () => void) => {
 soundService.playCombatActionSFX('assault_order');
 if (typeof action === 'function') {
 action();
 }
 };

 const handleLoadClick = () => {
 const handler = onOpenLoadGame || onLoadGame;
 handleMenuClick(handler);
 };

 return (
 <div className="relative w-screen h-screen bg-[#0A0A0A] overflow-hidden select-none font-tactical text-[#E8E8E8] animate-fade-in">
 {/* 1. Full-screen Cinematic Dynamic Apocalyptic Background with Day/Night & Weather */}
 <DynamicAtmosphericBackground enableWeather={true} />

 {/* Atmospheric vignette & left menu shading */}
 <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/90 via-[#0A0A0A]/55 to-transparent pointer-events-none" />
 <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A]/75 via-transparent to-[#0A0A0A]/60 pointer-events-none" />

 {/* 2. Top Right Telemetry Bar */}
 <div className="absolute top-4 right-6 z-30 flex items-center gap-3">
 <span className="text-xs font-tech font-bold tracking-widest text-[#E8E8E8]">
 VER {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.2.2'} BETA+
 </span>

 {/* Red exclamation alert box */}
 <button
 onClick={() => setActiveExtrasModal('updates')}
 title="Important Game Version Notice"
 className="w-7 h-7 bg-[#B31217] hover:bg-[#EF4444] border border-[#262F3D] flex items-center justify-center text-white font-display text-base font-bold transition-colors clip-card-chip surface-bevel"
 >
 !
 </button>

 {/* Roadmap button */}
 <button
 onClick={() => setActiveExtrasModal('roadmap')}
 className="px-4 py-1.5 bg-[#0E1013]/90 hover:bg-[#14171C] border border-[#262F3D] hover:border-[#E8E8E8] text-[#E8E8E8] hover:text-white font-heading text-xs uppercase tracking-widest transition-colors clip-tactical-bracket surface-bevel"
 >
 ROADMAP
 </button>
 </div>

 {/* 3. Left Navigation Menu */}
 <div className="relative z-20 h-full flex flex-col justify-between p-8 md:p-12 w-full max-w-sm">
 {/* Terminus Title Logo */}
 <div className="pt-2">
 <TerminusLogo size="lg" showSubtitle={true} className="items-start" />
 </div>

 {/* Vertical Menu Buttons */}
 <nav className="flex flex-col gap-1.5 my-auto w-64 md:w-72">
 {/* CONTINUE GAME */}
 <button
 onClick={() => {
 if (latestSave) handleMenuClick(onContinue);
 }}
 disabled={!latestSave}
 onMouseEnter={() => handleMenuHover('continue')}
 className={`w-full text-left px-5 py-2.5 font-heading text-sm uppercase tracking-widest transition-all border-b border-[#262F3D]/50 clip-tactical-chamfer-tr-bl ${
 latestSave
 ? 'bg-[#0E1013]/90 hover:bg-[#1A2634] text-[#E8E8E8] hover:text-[#E8E8E8] border-l-4 border-l-transparent hover:border-l-[#E8E8E8] surface-bevel'
 : 'bg-[#0E1013]/40 text-[#5A6270] cursor-not-allowed'
 }`}
 >
 CONTINUE GAME
 </button>

 {/* NEW GAME - Takes directly to 3D Globe / Starting Area View */}
 <button
 onClick={() => handleMenuClick(onNewGame)}
 onMouseEnter={() => handleMenuHover('new_game')}
 className="w-full text-left px-5 py-2.5 bg-[#0E1013]/90 hover:bg-[#1A2634] text-[#E8E8E8] hover:text-[#E8E8E8] font-heading text-sm uppercase tracking-widest transition-all border-b border-[#262F3D]/50 border-l-4 border-l-transparent hover:border-l-[#E8E8E8] clip-tactical-chamfer-tr-bl surface-bevel"
 >
 NEW GAME
 </button>

 {/* LOAD GAME */}
 <button
 onClick={handleLoadClick}
 onMouseEnter={() => handleMenuHover('load_game')}
 className="w-full text-left px-5 py-2.5 bg-[#0E1013]/90 hover:bg-[#1A2634] text-[#E8E8E8] hover:text-[#E8E8E8] font-heading text-sm uppercase tracking-widest transition-all border-b border-[#262F3D]/50 border-l-4 border-l-transparent hover:border-l-[#E8E8E8] clip-tactical-chamfer-tr-bl surface-bevel"
 >
 LOAD GAME
 </button>

 {/* SETTINGS */}
 <button
 onClick={() => handleMenuClick(onOpenSettings)}
 onMouseEnter={() => handleMenuHover('settings')}
 className="w-full text-left px-5 py-2.5 bg-[#0E1013]/90 hover:bg-[#1A2634] text-[#E8E8E8] hover:text-[#E8E8E8] font-heading text-sm uppercase tracking-widest transition-all border-b border-[#262F3D]/50 border-l-4 border-l-transparent hover:border-l-[#E8E8E8] clip-tactical-chamfer-tr-bl surface-bevel"
 >
 SETTINGS
 </button>

 {/* CREDITS */}
 <button
 onClick={() => handleMenuClick(onOpenCredits)}
 onMouseEnter={() => handleMenuHover('credits')}
 className="w-full text-left px-5 py-2.5 bg-[#0E1013]/90 hover:bg-[#1A2634] text-[#E8E8E8] hover:text-[#E8E8E8] font-heading text-sm uppercase tracking-widest transition-all border-b border-[#262F3D]/50 border-l-4 border-l-transparent hover:border-l-[#E8E8E8] clip-tactical-chamfer-tr-bl surface-bevel"
 >
 CREDITS
 </button>

 {/* EXTRAS — greyed out and unwired for now: the entry stays in the menu
     layout but is disabled and never opens the submenu flyout. */}
 <button
 disabled
 aria-disabled="true"
 title="Coming soon"
 className="w-full text-left px-5 py-2.5 font-heading text-sm uppercase tracking-widest transition-all border-b border-[#262F3D]/50 border-l-4 clip-tactical-chamfer-tr-bl bg-[#0E1013]/40 text-[#5A6270] border-l-transparent cursor-not-allowed"
 >
 EXTRAS
 </button>

 {/* EXIT GAME */}
 <button
 onClick={() => setShowExitConfirm(true)}
 onMouseEnter={() => handleMenuHover('exit')}
 className="w-full text-left px-5 py-2.5 bg-[#0E1013]/90 hover:bg-[#2B1010] text-[#E8E8E8] hover:text-[#EF4444] font-heading text-sm uppercase tracking-widest transition-all border-l-4 border-l-transparent hover:border-l-[#EF4444] clip-tactical-chamfer-tr-bl surface-bevel"
 >
 EXIT GAME
 </button>
 </nav>

 {/* Bottom Left: Screaming Zombie Portrait & SEND FEEDBACK */}
 <div className="pt-4 flex items-end gap-0">
 <div className="relative w-20 h-24 overflow-hidden border border-[#B31217]/80 bg-[#0A0A0A] surface-bevel">
 <img
 src={IFZ_IMAGES.infectedFace}
 alt="Infected Screaming Survivor"
 referrerPolicy="no-referrer"
 className="w-full h-full object-cover"
 />
 </div>

 <button
 onClick={() => {
 soundService.playCombatActionSFX('assault_order');
 setShowFeedbackModal(true);
 }}
 className="group relative -ml-2 mb-1 px-4 py-2 bg-[#B31217] hover:bg-[#EF4444] text-white font-heading text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all clip-tactical-tab surface-bevel"
 >
 <span className="pl-1">SEND FEEDBACK</span>
 <span className="text-white font-bold text-sm">»</span>
 </button>
 </div>
 </div>

 {/* 4. Extras Submenu Column Flyout */}
 {showExtrasSubmenu && (
 <div className="absolute top-[32%] left-[280px] md:left-[320px] z-30 w-60 bg-[#0E1013]/95 border border-[#262F3D] backdrop-blur-md clip-tactical-bracket surface-bevel">
 <div className="flex flex-col divide-y divide-[#262F3D]">
 <button
 onClick={() => setActiveExtrasModal('map_editor')}
 className="px-4 py-2.5 text-left text-xs font-heading font-bold uppercase tracking-wider text-[#8C9BAE] hover:text-white hover:bg-[#14171C] transition-colors"
 >
 MAP EDITOR
 </button>
 <button
 onClick={() => setActiveExtrasModal('workshop')}
 className="px-4 py-2.5 text-left text-xs font-heading font-bold uppercase tracking-wider text-[#8C9BAE] hover:text-white hover:bg-[#14171C] transition-colors"
 >
 WORKSHOP
 </button>
 <button
 onClick={() => setActiveExtrasModal('more_games')}
 className="px-4 py-2.5 text-left text-xs font-heading font-bold uppercase tracking-wider text-[#8C9BAE] hover:text-white hover:bg-[#14171C] transition-colors"
 >
 MORE GAMES
 </button>
 <button
 onClick={() => {
 setShowExtrasSubmenu(false);
 onOpenCodex?.();
 }}
 className="px-4 py-2.5 text-left text-xs font-heading font-bold uppercase tracking-wider text-[#8C9BAE] hover:text-white hover:bg-[#14171C] transition-colors"
 >
 GUIDES
 </button>
 <button
 onClick={() => setActiveExtrasModal('soundtrack')}
 className="px-4 py-2.5 text-left text-xs font-heading font-bold uppercase tracking-wider text-[#8C9BAE] hover:text-white hover:bg-[#14171C] transition-colors"
 >
 SOUNDTRACK
 </button>
 <button
 onClick={() => setActiveExtrasModal('wallpapers')}
 className="px-4 py-2.5 text-left text-xs font-heading font-bold uppercase tracking-wider text-[#8C9BAE] hover:text-white hover:bg-[#14171C] transition-colors"
 >
 WALLPAPERS
 </button>
 <button
 onClick={() => setShowExtrasSubmenu(false)}
 className="px-4 py-2.5 text-center text-xs font-heading font-bold uppercase tracking-wider text-[#5A6270] hover:text-white bg-[#0A0A0A] hover:bg-[#14171C] transition-colors"
 >
 BACK
 </button>
 </div>
 </div>
 )}

 {/* 5. Bottom Right Social Links */}
 <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-2.5">
 <a
 href="https://facebook.com"
 target="_blank"
 rel="noopener noreferrer"
 className="group flex items-center justify-between gap-3 px-4 py-2 bg-[#0E1013]/90 hover:bg-[#14171C] border border-[#262F3D] hover:border-[#B31217] text-xs font-heading tracking-wider text-[#E8E8E8] transition-all clip-tactical-bracket surface-bevel w-44"
 >
 <span className="group-hover:text-[#EF4444]">FACEBOOK</span>
 <div className="w-5 h-5 bg-[#B31217] group-hover:bg-[#EF4444] flex items-center justify-center text-white font-bold text-xs clip-card-chip">
 f
 </div>
 </a>

 <a
 href="https://discord.com"
 target="_blank"
 rel="noopener noreferrer"
 className="group flex items-center justify-between gap-3 px-4 py-2 bg-[#0E1013]/90 hover:bg-[#14171C] border border-[#262F3D] hover:border-[#B31217] text-xs font-heading tracking-wider text-[#E8E8E8] transition-all clip-tactical-bracket surface-bevel w-44"
 >
 <span className="group-hover:text-[#EF4444]">DISCORD</span>
 <div className="w-5 h-5 bg-[#B31217] group-hover:bg-[#EF4444] flex items-center justify-center text-white font-bold text-xs clip-card-chip">
 💬
 </div>
 </a>
 </div>

 {/* Feedback Modal */}
 {showFeedbackModal && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
 <div className="w-full max-w-md bg-[#0E1013] border border-[#262F3D] p-6 clip-tactical-bracket surface-bevel bg-tactical-steel">
 <div className="flex items-center justify-between pb-3 border-b border-[#262F3D]">
 <div className="text-xs font-heading font-bold text-white uppercase flex items-center gap-2">
 <AlertTriangle className="w-4 h-4 text-[#EF4444]" />
 <span>COMMUNITY FEEDBACK & BUG REPORT</span>
 </div>
 <button
 onClick={() => setShowFeedbackModal(false)}
 className="text-[#8C9BAE] hover:text-white"
 >
 <X className="w-4 h-4" />
 </button>
 </div>

 {feedbackSent ? (
 <div className="py-8 text-center space-y-2">
 <div className="text-sm font-heading font-bold text-[#4ADE80] uppercase">FEEDBACK RECEIVED!</div>
 <div className="text-xs font-tech text-[#8C9BAE]">
 Thank you for helping us improve Terminus.
 </div>
 <button
 onClick={() => {
 setFeedbackSent(false);
 setShowFeedbackModal(false);
 }}
 className="mt-4 px-5 py-2 bg-[#14171C] hover:bg-[#1A2634] border border-[#262F3D] text-[#E8E8E8] text-xs font-heading uppercase clip-tactical-bracket"
 >
 Close
 </button>
 </div>
 ) : (
 <div className="mt-4 space-y-4">
 <div className="text-xs font-tech text-[#8C9BAE]">
 Send your telemetry notes, balance impressions, or feature ideas directly to the dev team.
 </div>
 <textarea
 value={feedbackText}
 onChange={(e) => setFeedbackText(e.target.value)}
 placeholder="Type your feedback, bug report, or tactical suggestions here..."
 className="w-full h-28 bg-[#0A0A0A] border border-[#262F3D] p-3 text-[#E8E8E8] text-xs font-tech focus:border-[#E8E8E8] outline-none resize-none"
 />
 <div className="flex justify-end gap-2">
 <button
 onClick={() => setShowFeedbackModal(false)}
 className="px-4 py-2 bg-[#14171C] hover:bg-[#1A2634] border border-[#262F3D] text-[#E8E8E8] text-xs font-heading uppercase clip-tactical-bracket"
 >
 Cancel
 </button>
 <button
 onClick={() => {
 if (feedbackText.trim()) {
 setFeedbackSent(true);
 setFeedbackText('');
 }
 }}
 className="px-4 py-2 bg-[#B31217] hover:bg-[#EF4444] border border-[#EF4444] text-white text-xs font-heading uppercase font-bold clip-tactical-bracket surface-bevel"
 >
 Transmit Feedback
 </button>
 </div>
 </div>
 )}
 </div>
 </div>
 )}

 {/* Extras Details Modal */}
 {activeExtrasModal && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
 <div className="w-full max-w-lg bg-[#0E1013] border border-[#262F3D] p-6 clip-tactical-bracket surface-bevel bg-tactical-steel space-y-4">
 <div className="flex items-center justify-between pb-3 border-b border-[#262F3D]">
 <div className="text-xs font-heading font-bold text-white uppercase">
 {activeExtrasModal.replace('_', ' ')}
 </div>
 <button
 onClick={() => setActiveExtrasModal(null)}
 className="text-[#8C9BAE] hover:text-white"
 >
 <X className="w-4 h-4" />
 </button>
 </div>

 <div className="text-xs font-tech text-[#E8E8E8] leading-relaxed space-y-3">
 {activeExtrasModal === 'roadmap' && (
 <div>
 <div className="font-heading font-bold text-[#E8E8E8] mb-2 text-sm">TERMINUS ROADMAP:</div>
 <ul className="list-disc pl-4 space-y-1.5 text-[#8C9BAE]">
 <li>Continuous Real-World OSM Map Ingestion and Elevation Meshing (Active)</li>
 <li>Full 3D Squad Real-Time Combat with Weapon Firing Lines (Active)</li>
 <li>Building Adapting, Barricading, and Itemized Scavenging (Active)</li>
 <li>Overland Caravan Trade & Multi-Colony Expansion (Active)</li>
 <li>Dynamic Weather, Freezing Blizzards & Heatwaves (Active)</li>
 </ul>
 </div>
 )}

 {activeExtrasModal === 'updates' && <ChangelogReleaseNotes />}

 {activeExtrasModal === 'map_editor' && (
 <p>
 The custom tactical Map Editor allows selecting any global coordinates via latitude/longitude or city search, generating real-world terrain elevation, vegetation, and road networks.
 </p>
 )}

 {activeExtrasModal === 'workshop' && (
 <p>
 Community custom scenario scripts, custom weapon packs, and localized survivor events will sync directly through the Workshop manager.
 </p>
 )}

 {activeExtrasModal === 'soundtrack' && (
 <p>
 Dynamic reactive ambient audio: tracks dynamically shift from eerie daytime wind and rustling trees into menacing tactical percussion and combat brass when night falls.
 </p>
 )}

 {activeExtrasModal === 'wallpapers' && (
 <p>
 High-definition concept art and render wallpapers are available in your installation directory under /assets.
 </p>
 )}
 </div>

 <div className="flex justify-end pt-2">
 <button
 onClick={() => setActiveExtrasModal(null)}
 className="px-4 py-1.5 bg-[#14171C] hover:bg-[#1A2634] border border-[#262F3D] text-[#E8E8E8] text-xs font-heading uppercase clip-tactical-bracket"
 >
 Close
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Exit Game Confirmation Dialog */}
 {showExitConfirm && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
 <div className="w-full max-w-sm bg-[#0E1013] border border-[#B31217]/80 p-6 clip-tactical-bracket surface-bevel bg-tactical-steel space-y-4">
 <div className="text-sm font-heading font-bold text-white uppercase text-center">
 EXIT GAME?
 </div>
 <div className="text-xs font-tech text-[#8C9BAE] text-center">
 Are you sure you want to exit Terminus? Any uncommitted expedition progress will be preserved in autosave slots.
 </div>
 <div className="flex justify-center gap-3 pt-2">
 <button
 onClick={() => setShowExitConfirm(false)}
 className="px-5 py-2 bg-[#14171C] hover:bg-[#1A2634] border border-[#262F3D] text-[#E8E8E8] text-xs font-heading uppercase font-bold clip-tactical-bracket"
 >
 Cancel
 </button>
 <button
 onClick={() => {
 setShowExitConfirm(false);
 window.location.reload();
 }}
 className="px-5 py-2 bg-[#B31217] hover:bg-[#EF4444] border border-[#EF4444] text-white text-xs font-heading uppercase font-bold clip-tactical-bracket surface-bevel"
 >
 Exit to Desktop
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
};

