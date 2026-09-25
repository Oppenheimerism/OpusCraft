// A world as a file, from the menus: Make Backup (Edit World) downloads one, Import World (Select World) and files
// dropped on the world list bring them in (storage/worldTransfer.ts does the work). The screens shown meanwhile.

import type { Game } from '../../game/game';
import { Screen, Button } from '../screen';
import type { GuiGraphics } from '../guiGraphics';
import { SystemToast } from '../toasts';
import type { WorldMeta } from '../../storage/worldStore';
import { exportWorld, importWorld } from '../../storage/worldTransfer';
import { WorldFileError } from '../../storage/worldFile';
import { requestPersistentStorage } from '../../game/saveOnLeave';

/** vanilla ProgressScreen: a header, and the stage with how far along it is */
export class ProgressScreen extends Screen {
  stage = '';
  /** 0 to 1 */
  progress = 0;

  constructor(game: Game, header: string) {
    super(game, header);
  }
  init(): void {}
  override shouldCloseOnEsc(): boolean {
    return false;
  }
  override titleY(): number {
    return 70;
  }
  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    super.render(g, mx, my, partial);
    if (this.stage) g.centered(`${this.stage} ${Math.floor(this.progress * 100)}%`, this.width / 2, 90, 0xffffff, true);
  }
}

/** vanilla AlertScreen: a title, a message, and a button back */
export class AlertScreen extends Screen {
  private lines: string[] = [];

  constructor(game: Game, private readonly callback: () => void, title: string, private readonly message: string, private readonly okButton = 'Back') {
    super(game, title);
  }
  init(): void {
    this.lines = this.game.gui.wrap(this.message, this.width - 50);
    const y = Math.max(Math.floor(this.height / 6) + 96, Math.min(this.height - 24, 90 + this.lines.length * 9 + 12));
    this.add(new Button(Math.floor((this.width - 150) / 2), y, 150, 20, this.okButton, () => this.callback()));
  }
  override titleY(): number {
    return 70;
  }
  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    super.render(g, mx, my, partial);
    this.lines.forEach((l, i) => g.centered(l, this.width / 2, 90 + i * 9, 0xffffff, true));
  }
  override onClose(): void {
    this.callback();
  }
}

// ---------------------------------------------------------------------------
// Make Backup

/**
 * Edit World's Make Backup (vanilla EditWorldScreen.makeBackupAndShowToast): the world downloaded as
 * "<World Name>.world", a toast saying so, and back to the world list
 */
export async function makeBackup(game: Game, meta: WorldMeta, back: Screen | null): Promise<void> {
  const progress = new ProgressScreen(game, 'Backing up world');
  progress.stage = 'Saving chunks';
  game.setScreen(progress);
  try {
    const blob = await exportWorld(meta.id, (f) => (progress.progress = f));
    download(blob, backupFileName(meta.name));
    game.toasts.add(new SystemToast('world_backup', fitToast(game.gui, `Backed up: ${meta.id}`), `size: ${Math.ceil(blob.size / 1048576)} MB`));
  } catch (e) {
    console.error('Make Backup', e);
    game.toasts.add(new SystemToast('world_backup', 'Backup failed', fitToast(game.gui, errorText(e))));
  }
  game.setScreen(back);
}

/** the world's name, made safe for a file */
export function backupFileName(name: string): string {
  return (name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim() || 'World') + '.world';
}

/** saved through the browser's downloads: an object URL on an <a download>, let go of once it's under way */
function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // (not straight away: a browser may only read the URL once the download has started)
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** a system toast is 160 wide here (vanilla's grows to fit): a longer line is cut short */
function fitToast(g: GuiGraphics, s: string, w = 160 - 18 - 4): string {
  if (g.textWidth(s) <= w) return s;
  while (s.length > 1 && g.textWidth(s + '...') > w) s = s.slice(0, -1);
  return s + '...';
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message || e.name : String(e);
}

// ---------------------------------------------------------------------------
// Import World

/** Import World: each file in as a new world, then `done` with the last one in (null: none got in) */
export async function importWorldFiles(game: Game, files: File[], done: (imported: WorldMeta | null) => void): Promise<void> {
  requestPersistentStorage();
  let last: WorldMeta | null = null;
  for (const file of files) {
    const progress = new ProgressScreen(game, 'Importing world');
    progress.stage = 'Saving chunks';
    game.setScreen(progress);
    try {
      last = await importWorld(file, (f) => (progress.progress = f));
    } catch (e) {
      console.error('Import World', file.name, e);
      const back = last;
      game.setScreen(new AlertScreen(game, () => done(back), 'Failed to import world', importError(file.name, e)));
      return;
    }
  }
  done(last);
}

function importError(fileName: string, e: unknown): string {
  const f = `'${fileName}'`;
  if (!(e instanceof WorldFileError)) return `Something went wrong while trying to import ${f}: ${errorText(e)}`;
  switch (e.problem) {
    case 'not_world':
      return `${f} is not a world file`;
    case 'newer':
      return `${f} was made by a newer version of the game`;
    case 'unsupported':
      return `This browser can't unpack ${f}`;
    default:
      return `${f} is damaged and can't be read`;
  }
}

let picker: HTMLInputElement | null = null;

/** the browser's file chooser, for world files */
export function pickWorldFiles(then: (files: File[]) => void): void {
  picker?.remove();
  const input = (picker = document.createElement('input'));
  input.type = 'file';
  input.accept = '.world';
  input.multiple = true;
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.remove();
    if (files.length) then(files);
  });
  input.addEventListener('cancel', () => input.remove());
  document.body.appendChild(input);
  input.click();
}

/** world files dragged onto the page and dropped, while the Select World screen is up */
export class WorldFileDrop {
  /** when files were last dragged over the page */
  private overAt = 0;

  private readonly onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    // (or the browser opens the file in the tab, in place of the game)
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    this.overAt = performance.now();
  };

  private readonly onDrop = (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    this.overAt = 0;
    const files = [...e.dataTransfer.files];
    if (files.length) this.then(files);
  };

  constructor(private readonly then: (files: File[]) => void) {}

  /** files are being dragged over the page (dragover comes every few frames while they are) */
  get dragging(): boolean {
    return performance.now() - this.overAt < 200;
  }

  install(): void {
    window.addEventListener('dragover', this.onDragOver);
    window.addEventListener('drop', this.onDrop);
  }

  remove(): void {
    window.removeEventListener('dragover', this.onDragOver);
    window.removeEventListener('drop', this.onDrop);
    this.overAt = 0;
  }
}
