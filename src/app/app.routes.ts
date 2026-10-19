import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { tyroUiErrorRoutes, TyroUiSeo, tyroUiLocalizedRoutes } from 'tyrolium-ui';

/* ─── SEO (titre + description par page, FR / EN) ─────────────────────── */

const SEO_HOME: TyroUiSeo = {
  fullTitle:   { fr: 'Speedtest - Tyrolium / SolidServ', en: 'Speedtest - Tyrolium / SolidServ' },
  description: { fr: "Testez la vitesse de votre connexion internet gratuitement : débit descendant, débit montant, ping et gigue, sur l'infrastructure Tyrolium / SolidServ.", en: 'Test your internet connection speed for free: download, upload, ping and jitter, on the Tyrolium / SolidServ infrastructure.' },
};

export const routes: Routes = tyroUiLocalizedRoutes([
  { path: '',    component: Home, data: { seo: SEO_HOME } },
  ...tyroUiErrorRoutes(),
]);
