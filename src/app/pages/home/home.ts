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
