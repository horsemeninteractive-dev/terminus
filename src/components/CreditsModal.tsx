import React from 'react';
import { X, Info, Globe, Shield, Heart, Radio } from 'lucide-react';

interface CreditsModalProps {
 isOpen: boolean;
 onClose: () => void;
}

export const CreditsModal: React.FC<CreditsModalProps> = ({ isOpen, onClose }) => {
 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
 <div className="relative w-full max-w-xl bg-[#0B0F19] border-2 border-[#24334A] overflow-hidden text-[#CBD5E1] font-sans clip-tactical-bracket surface-bevel">
 {/* Header */}
 <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E293B] bg-[#0E1524]">
 <div className="flex items-center gap-3">
 <div className="p-2 bg-[#1E293B] border border-[#E8E8E8]/40 text-[#E8E8E8]">
 <Info className="w-5 h-5" />
 </div>
 <div>
 <h2 className="text-xl font-heading font-black tracking-wide text-white uppercase">
 TERMINUS // CREDITS & INTEL
 </h2>
 <p className="text-xs font-mono text-[#94A3B8]">
 Project attribution and technological acknowledgements
 </p>
 </div>
 </div>

 <button
 onClick={onClose}
 className="p-1.5 text-[#64748B] hover:text-white hover:bg-[#1E293B] transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Body */}
 <div className="p-6 space-y-4 text-xs font-mono">
 <div className="p-4 bg-[#0E1524] border border-[#1E293B]">
 <h4 className="text-sm font-heading font-bold text-white uppercase mb-1 flex items-center gap-2">
 <Shield className="w-4 h-4 text-[#E8E8E8]" />
 <span>TERMINUS: INFECTION FREE ZONE ENGINE</span>
 </h4>
 <p className="text-[#94A3B8] leading-relaxed">
 An advanced real-world 3D zombie survival strategy simulation. Designed as a deep homage to the innovative OpenStreetMap RTS mechanics of <span className="text-white font-bold">Infection Free Zone</span> (Jutsu Games).
 </p>
 </div>

 <div className="p-4 bg-[#0E1524] border border-[#1E293B] space-y-2">
 <h4 className="text-xs font-heading font-bold text-white uppercase text-[#E8E8E8]">
 CORE TECHNOLOGIES & LIBRARIES
 </h4>
 <ul className="space-y-1 text-[#94A3B8]">
 <li>• <span className="text-white">Three.js</span>: 3D WebGL tactical viewport, procedural meshes & lighting</li>
 <li>• <span className="text-white">OpenStreetMap (OSM) / Overpass API</span>: Global building footprint and road network ingestion</li>
 <li>• <span className="text-white">Web Audio API</span>: Procedural synthesizers, spatial weapon acoustics & day/night ambiance</li>
 <li>• <span className="text-white">Earcut</span>: Polygon tessellation & 3D roof triangulation</li>
 <li>• <span className="text-white">Tailwind CSS & Lucide Icons</span>: Diegetic military HUD and tactical overlays</li>
 </ul>
 </div>

 <div className="p-3 bg-[#080C14] border border-[#1C283B] text-center text-[#64748B]">
 Earth data © OpenStreetMap contributors under ODbL License.
 </div>
 </div>

 {/* Footer */}
 <div className="flex justify-end px-6 py-3.5 border-t border-[#1E293B] bg-[#0E1524]">
 <button
 onClick={onClose}
 className="px-5 py-1.5 bg-[#1E293B] hover:bg-[#2A374A] border border-[#E8E8E8]/40 text-xs font-mono text-white transition-colors"
 >
 CLOSE
 </button>
 </div>
 </div>
 </div>
 );
};
