import { Component, inject, signal, computed, ViewEncapsulation } from '@angular/core';
import { TyroUiLangService } from 'tyrolium-ui';

// LibreSpeed (speedtest.js) est chargé en <script> classique dans index.html,
// et expose ce constructeur global. Toute la mesure vit dans speedtest.js /
// speedtest_worker.js (vendored dans public/) - ce composant ne fait que lire
// les données qu'ils publient et piloter start()/abort().
declare const Speedtest: any;

interface LibreSpeedData {
  testState: number; // -1=pas démarré, 0=démarrage, 1=download, 2=ping+jitter, 3=upload, 4=terminé, 5=aborted
  dlStatus: string;
  ulStatus: string;
  pingStatus: string;
  jitterStatus: string;
}

// ─── Jauge façon compteur de vitesse ────────────────────────────────────────
// Géométrie de l'arc SVG (voir home.css .st-gauge) : un demi-cercle "ouvert"
// en bas façon compteur auto, balayage de 240° (de -120° à +120°, 0° = haut).
const GAUGE_CX = 100;
const GAUGE_CY = 92;
const GAUGE_R = 78;
const GAUGE_START = -120;
const GAUGE_END = 120;

function polarToCartesian(angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: GAUGE_CX + GAUGE_R * Math.cos(rad), y: GAUGE_CY + GAUGE_R * Math.sin(rad) };
}

function describeArc(startAngle: number, endAngle: number): string {
  const start = polarToCartesian(endAngle);
  const end = polarToCartesian(startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${GAUGE_R} ${GAUGE_R} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

// Formule officielle de l'UI LibreSpeed (mbpsToAmount) : mappe un débit en
// Mbit/s (sans borne fixe) vers une fraction 0-1 avec des rendements
// décroissants, pour que la jauge reste lisible aussi bien à 5 Mbps qu'à
// 500 Mbps sans avoir à choisir une échelle max arbitraire.
function mbpsToFraction(mbps: number): number {
  if (mbps <= 0) return 0;
  return 1 - 1 / Math.pow(1.3, Math.sqrt(mbps));
}

// Au-delà de 5 caractères, le chiffre en <text> SVG peut toucher l'arc
// (ex: "1604.07"). On force alors sa largeur via textLength/lengthAdjust
// pour qu'il reste toujours contenu dans la jauge, quel que soit le nombre
// de chiffres. En dessous, on laisse le rendu naturel (pas d'étirement).
const GAUGE_TEXT_MAX_LENGTH = 130;
function gaugeTextLength(value: string): number | null {
  return value.length > 5 ? GAUGE_TEXT_MAX_LENGTH : null;
}

// Affichage download/upload : 2 décimales seulement sous les 10 Mbps (ex:
// "1.28"), sinon un entier sans décimale (ex: "23", "123") - les décimales
// n'apportent plus rien de lisible une fois à deux chiffres ou plus.
function formatSpeed(raw: string, useComma: boolean): string {
  const n = parseFloat(raw);
  if (!isFinite(n)) return raw;
  const intDigits = Math.max(1, Math.floor(Math.abs(n)).toString().length);
  const formatted = intDigits <= 1 ? n.toFixed(2) : Math.round(n).toString();
  return useComma ? formatted.replace('.', ',') : formatted;
}

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html',
  styleUrl: './home.css',
  encapsulation: ViewEncapsulation.None,
})
export class Home {
  readonly lang = inject(TyroUiLangService).lang;

  private test: any = null;
  private userAborted = false;

  readonly running = signal(false);
  readonly error = signal(false);
  readonly testState = signal(-1);

  readonly download = signal<string | null>(null);
  readonly upload = signal<string | null>(null);
  readonly ping = signal<string | null>(null);
  readonly jitter = signal<string | null>(null);

  readonly gaugeTrackPath = describeArc(GAUGE_START, GAUGE_END);

  readonly downloadArcPath = computed(() => {
    const fraction = Math.max(mbpsToFraction(parseFloat(this.download() ?? '0') || 0), 0.002);
    return describeArc(GAUGE_START, GAUGE_START + fraction * (GAUGE_END - GAUGE_START));
  });

  readonly uploadArcPath = computed(() => {
    const fraction = Math.max(mbpsToFraction(parseFloat(this.upload() ?? '0') || 0), 0.002);
    return describeArc(GAUGE_START, GAUGE_START + fraction * (GAUGE_END - GAUGE_START));
  });

  readonly downloadDisplay = computed(() => {
    const v = this.download();
    return v ? formatSpeed(v, this.lang() !== 'en') : '—';
  });

  readonly uploadDisplay = computed(() => {
    const v = this.upload();
    return v ? formatSpeed(v, this.lang() !== 'en') : '—';
  });

  readonly downloadTextLength = computed(() => gaugeTextLength(this.downloadDisplay()));
  readonly uploadTextLength = computed(() => gaugeTextLength(this.uploadDisplay()));

  readonly phaseLabel = computed<string | null>(() => {
    const en = this.lang() === 'en';
    switch (this.testState()) {
      case 0: return en ? 'Starting...' : 'Initialisation...';
      case 1: return en ? 'Testing download...' : 'Test du débit descendant...';
      case 2: return en ? 'Testing ping & jitter...' : 'Test du ping et de la gigue...';
      case 3: return en ? 'Testing upload...' : 'Test du débit montant...';
      case 4: return en ? 'Done!' : 'Terminé !';
      default: return null;
    }
  });

  toggleTest() {
    if (this.running()) {
      this.userAborted = true;
      this.test?.abort();
      return;
    }

    this.error.set(false);
    this.testState.set(-1);
    this.download.set(null);
    this.upload.set(null);
    this.ping.set(null);
    this.jitter.set(null);
    this.userAborted = false;
    this.running.set(true);

    this.test = new Speedtest();
    // ordre par défaut de LibreSpeed = "IP_D_U", interprété caractère par
    // caractère (I=ip, P=ping+jitter, _=pause, D=download, U=upload) - il
    // couvre déjà nos 4 métriques, pas besoin de le modifier.

    this.test.onupdate = (data: LibreSpeedData) => {
      this.testState.set(Number(data.testState));
      this.download.set(data.dlStatus || null);
      this.upload.set(data.ulStatus || null);
      this.ping.set(data.pingStatus || null);
      this.jitter.set(data.jitterStatus || null);
    };

    this.test.onend = (aborted: boolean) => {
      this.running.set(false);
      if (aborted && !this.userAborted) {
        this.error.set(true);
      }
    };

    this.test.start();
  }
}
