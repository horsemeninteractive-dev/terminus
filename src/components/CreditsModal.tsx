import React, { useEffect, useState } from 'react';
import { X, Globe, Shield, Code, Palette, Heart, Lock, ChevronDown } from 'lucide-react';
import { soundService } from '../services/soundService';

interface CreditsModalProps {
 isOpen: boolean;
 onClose: () => void;
}

/**
 * Fullscreen cinematic end-credits roll (§0b), styled as a Terminus tactical
 * briefing. A column of credit cards scrolls upward from below the viewport,
 * then fades out. ESC, the X button, or a click anywhere dismisses it.
 * Structure adapted from the previous-project credits screen: studio identity,
 * development, art & design, and legal sections — re-themed for Terminus.
 */
export const CreditsModal: React.FC<CreditsModalProps> = ({ isOpen, onClose }) => {
 const [hasRolled, setHasRolled] = useState(false);

 // Reset the roll state each time the modal opens.
 useEffect(() => {
   if (isOpen) {
     setHasRolled(false);
     soundService.playStartGameImpact();
   }
 }, [isOpen]);

 // ESC to close; auto-finish the roll once the animation completes.
 useEffect(() => {
   if (!isOpen) return;
   const handleKeyDown = (e: KeyboardEvent) => {
     if (e.key === 'Escape') {
       e.preventDefault();
       onClose();
     }
   };
   window.addEventListener('keydown', handleKeyDown);
   return () => window.removeEventListener('keydown', handleKeyDown);
 }, [isOpen, onClose]);

 if (!isOpen) return null;

 return (
   <div
     className="fixed inset-0 z-[80] overflow-hidden select-none font-tactical text-[#E8E8E8] cursor-pointer"
     onClick={onClose}
   >
     {/* Cinematic backdrop: tactical steel grid + deep vignette */}
     <div className="absolute inset-0 bg-[#050607] bg-tactical-steel" />
     <div className="absolute inset-0 bg-tactical-stripes opacity-25" />
     <div className="absolute inset-0 bg-radial from-transparent via-[#0A0A0A]/45 to-[#040405]/95" />
     <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A]/80 via-transparent to-[#040405]/90" />

     {/* Skip / close */}
     <button
       onClick={(e) => {
         e.stopPropagation();
         soundService.playCombatActionSFX('assault_order');
         onClose();
       }}
       className="absolute top-5 right-5 z-30 p-2 bg-[#0E1013]/90 hover:bg-[#1A2634] border border-[#262F3D] hover:border-[#EF4444] text-[#8C9BAE] hover:text-white transition-colors clip-tactical-bracket surface-bevel"
       aria-label="Close credits"
     >
       <X className="w-5 h-5" />
     </button>

     {/* Bottom skip hint */}
     <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 text-[10px] font-tech uppercase tracking-widest text-[#5B6B7C]">
       <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
       Click anywhere to skip
     </div>

     {/* Rolling credits column */}
     <div className="absolute inset-0 flex justify-center overflow-hidden">
       <div className="w-full max-w-2xl px-6 md:px-8">
         <div
           className="animate-credits-roll py-[12vh]"
           onAnimationEnd={() => setHasRolled(true)}
         >
           {/* Studio opener */}
           <div className="text-center mb-16">
             <div className="inline-block px-5 py-2 border border-[#B31217]/60 text-[#EF4444] text-[10px] font-tech uppercase tracking-[0.3em] mb-8 clip-tactical-bracket">
               A Horsemen Interactive Production
             </div>
             <div className="font-heading font-black text-5xl md:text-6xl tracking-[0.15em] uppercase text-white drop-shadow-[0_0_24px_rgba(179,18,23,0.55)] mb-3">
               TERMINUS
             </div>
             <div className="text-xs md:text-sm font-tech text-[#8C9BAE] uppercase tracking-[0.25em]">
               Real-World Survival Strategy
             </div>
           </div>

           {/* Studio */}
           <div className="text-center mb-16">
             <div className="flex items-center justify-center gap-3 mb-5">
               <Shield className="w-5 h-5 text-[#EF4444]" />
               <h3 className="font-heading font-bold text-xl text-white uppercase tracking-widest">
                 Horsemen Interactive
               </h3>
             </div>
             <p className="text-xs md:text-sm text-[#A6B3C4] leading-relaxed max-w-md mx-auto mb-5">
               Mapping the end of the world — and the fight to survive it. Terminus
               is built on the real OpenStreetMap fabric of Earth, one city at a time.
             </p>
             <a
               href="https://horsemen-interactive.web.app/"
               target="_blank"
               rel="noopener noreferrer"
               onClick={(e) => e.stopPropagation()}
               className="inline-flex items-center gap-1.5 text-[#EF4444] hover:text-[#F87171] text-[11px] font-tech uppercase tracking-widest"
             >
               <Globe className="w-3.5 h-3.5" /> Website
             </a>
           </div>

           {/* Development */}
           <div className="bg-[#0E1013]/80 border border-[#1C283B] clip-tactical-bracket surface-bevel p-6 md:p-8 mb-8">
             <div className="flex items-center gap-2 text-[#7DD3FC] mb-4">
               <Code className="w-4 h-4" />
               <h4 className="font-heading font-bold text-xs uppercase tracking-[0.2em]">
                 Development
               </h4>
             </div>
             <ul className="space-y-2.5 text-xs md:text-sm text-[#A6B3C4] font-tech leading-relaxed">
               <li><span className="text-white">Core Engine:</span> React &amp; Three.js — real-world 3D WebGL tactical viewport</li>
               <li><span className="text-white">Map Data:</span> OpenStreetMap / Overpass API — global building footprints, roads &amp; elevation</li>
               <li><span className="text-white">Simulation:</span> Terminus persistent world sim — day/night, lairs, hordes, supply chains</li>
               <li><span className="text-white">Audio:</span> Web Audio API — procedural synthesizers, spatial combat acoustics &amp; ambiance</li>
             </ul>
           </div>

           {/* Art & Design */}
           <div className="bg-[#0E1013]/80 border border-[#1C283B] clip-tactical-bracket surface-bevel p-6 md:p-8 mb-8">
             <div className="flex items-center gap-2 text-[#A78BFA] mb-4">
               <Palette className="w-4 h-4" />
               <h4 className="font-heading font-bold text-xs uppercase tracking-[0.2em]">
                 Art &amp; Design
               </h4>
             </div>
             <ul className="space-y-2.5 text-xs md:text-sm text-[#A6B3C4] font-tech leading-relaxed">
               <li><span className="text-white">UI Design:</span> Horsemen Interactive — diegetic military HUD &amp; tactical overlays</li>
               <li><span className="text-white">World Graphics:</span> Three.js procedural meshes, Earcut roof triangulation</li>
               <li><span className="text-white">Illustrations:</span> AI Synthesis</li>
               <li><span className="text-white">Sound Design:</span> Terminus Audio</li>
             </ul>
           </div>

           {/* Legal */}
           <div className="bg-[#0E1013]/80 border border-[#1C283B] clip-tactical-bracket surface-bevel p-6 md:p-8 mb-16">
             <div className="flex items-center gap-2 text-[#F87171] mb-4">
               <Lock className="w-4 h-4" />
               <h4 className="font-heading font-bold text-xs uppercase tracking-[0.2em]">
                 Legal Information
               </h4>
             </div>
             <div className="space-y-3 text-[11px] md:text-xs text-[#8C9BAE] font-tech leading-relaxed">
               <p>
                 © 2026 Horsemen Interactive. All rights reserved. Terminus, the Horsemen
                 Interactive logo, and all associated artistic assets are trademarks of
                 Horsemen Interactive.
               </p>
               <p>
                 Unauthorized duplication, modification, or distribution is prohibited. This
                 software is provided "as is" without warranty of any kind, express or implied.
               </p>
               <div className="bg-[#080C14] border border-[#1C283B] p-4 clip-tactical-bracket">
                 <p className="text-[10px] text-[#5B6B7C] uppercase font-bold mb-2 tracking-widest">
                   Open Source &amp; Data Disclosure
                 </p>
                 <p className="text-[10px]">
                   Earth data © OpenStreetMap contributors under the ODbL license. Built with
                   React, Three.js, Tailwind CSS, Lucide, Earcut, Vite &amp; the Web Audio API.
                 </p>
               </div>
             </div>
           </div>

           {/* Closing */}
           <div className="text-center mb-16">
             <div className="font-heading font-bold text-white uppercase tracking-[0.3em] mb-2">
               Thanks for playing
             </div>
             <div className="flex items-center justify-center gap-1.5 text-[#EF4444]">
               Made with <Heart className="w-3 h-3 fill-[#EF4444]" /> by Horsemen Interactive
             </div>
             {hasRolled && (
               <button
                 onClick={(e) => {
                   e.stopPropagation();
                   soundService.playCombatActionSFX('assault_order');
                   onClose();
                 }}
                 className="mt-8 px-6 py-2 bg-[#B31217] hover:bg-[#EF4444] border border-[#EF4444] text-white text-xs font-heading uppercase font-bold clip-tactical-bracket surface-bevel transition-colors"
               >
                 Return to Base
               </button>
             )}
           </div>
         </div>
       </div>
     </div>
   </div>
 );
};