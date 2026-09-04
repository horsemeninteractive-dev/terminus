import menuBgDawn from './images/main_menu_dawn.jpg';
import menuBgDay from './images/main_menu_day.jpg';
import menuBgDusk from './images/main_menu_dusk.jpg';
import menuBgNight from './images/main_menu_night.jpg';
import realisticClouds from './images/realistic_clouds_1787517064184.jpg';
import wispyClouds from './images/wispy_clouds_1787517075953.jpg';
import volumetricFog from './images/volumetric_fog_texture_1787517248584.jpg';
import groundMist from './images/ground_mist_texture_1787517263375.jpg';
import infectedFace from './images/ifz_infected_face_1787419123003.jpg';
import loadingTruck from './images/ifz_loading_truck_1787419138732.jpg';
import eveshamCity from './images/ifz_evesham_city_1787419158610.jpg';

export const IFZ_IMAGES = {
  menuBg: menuBgDay,
  menuBgDawn,
  menuBgDay,
  menuBgDusk,
  menuBgNight,
  realisticClouds,
  wispyClouds,
  volumetricFog,
  groundMist,
  infectedFace,
  loadingTruck,
  eveshamCity,
};

/**
 * Preload an image asset and optionally trigger GPU decoding so it paints
 * instantly with zero scanline / draw-in lag when rendered.
 */
export const preloadImage = (src: string): Promise<void> => {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.src = src;
    if (img.complete) {
      if ('decode' in img && typeof img.decode === 'function') {
        img.decode().then(resolve).catch(() => resolve());
      } else {
        resolve();
      }
      return;
    }
    img.onload = () => {
      if ('decode' in img && typeof img.decode === 'function') {
        img.decode().then(resolve).catch(() => resolve());
      } else {
        resolve();
      }
    };
    img.onerror = () => resolve();
  });
};

/**
 * Preload high-priority visual assets on application startup so loading screens
 * and menu transitions are instantaneous and never draw in progressively.
 */
export const preloadCriticalGameImages = (): void => {
  if (typeof window === 'undefined') return;
  // Preload heavy loading screen artwork and menu cycle backgrounds
  preloadImage(IFZ_IMAGES.loadingTruck);
  preloadImage(IFZ_IMAGES.menuBgDay);
  preloadImage(IFZ_IMAGES.menuBgNight);
  preloadImage(IFZ_IMAGES.menuBgDusk);
  preloadImage(IFZ_IMAGES.menuBgDawn);
};
