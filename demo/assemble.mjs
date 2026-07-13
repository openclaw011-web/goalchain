// Assemble the final demo MP4 from scene webms (+ narration audio when present).
// Each segment is padded so neither video nor narration is cut short:
//   segment duration = max(video, narration + 0.7s tail)
// Narration files: audio/<scene>.wav|.mp3 (e.g. audio/01-opening.wav)
// Usage: node assemble.mjs [output.mp4]
import { existsSync, readdirSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? join(__dirname, 'goalchain-demo.mp4');
const seg = join(__dirname, 'segments');
mkdirSync(seg, { recursive: true });

const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const dur = (f) => Number(sh(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${f}"`).trim());

const scenes = readdirSync(join(__dirname, 'scenes'))
  .filter((f) => /^\d\d-.*\.webm$/.test(f))
  .sort();

const parts = [];
for (const f of scenes) {
  const name = f.replace('.webm', '');
  const video = join(__dirname, 'scenes', f);
  const audio = ['wav', 'mp3', 'm4a'].map((e) => join(__dirname, 'audio', `${name}.${e}`)).find(existsSync);
  const out = join(seg, `${name}.mp4`);
  const vd = dur(video);
  const ad = audio ? dur(audio) + 0.7 : 0;
  const total = Math.max(vd, ad);

  // openh264: Fedora's ffmpeg ships without libx264
  const enc = '-c:v libopenh264 -b:v 6M -maxrate 8M -pix_fmt yuv420p';
  const vf = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,tpad=stop_mode=clone:stop_duration=${Math.max(0, total - vd).toFixed(2)}`;
  // Normalize audio to 48kHz stereo: TTS wavs are 24kHz mono, which some
  // players render silently and which breaks -c copy concat consistency.
  if (audio) {
    sh(`ffmpeg -y -v error -i "${video}" -i "${audio}" -filter_complex "[0:v]${vf}[v];[1:a]adelay=400|400,apad,aresample=48000,aformat=channel_layouts=stereo[a]" -map "[v]" -map "[a]" -t ${total.toFixed(2)} ${enc} -c:a aac -ar 48000 -ac 2 -b:a 192k "${out}"`);
  } else {
    sh(`ffmpeg -y -v error -i "${video}" -f lavfi -i anullsrc=r=48000:cl=stereo -filter_complex "[0:v]${vf}[v]" -map "[v]" -map 1:a -t ${total.toFixed(2)} ${enc} -c:a aac -ar 48000 -ac 2 -b:a 192k "${out}"`);
  }
  parts.push(out);
  console.log(`✔ ${name}  video=${vd.toFixed(1)}s  ${audio ? `narration=${(ad - 0.7).toFixed(1)}s` : 'silent'}  → ${total.toFixed(1)}s`);
}

const list = join(seg, 'list.txt');
execSync(`printf '%s\n' ${parts.map((p) => `"file '${p}'"`).join(' ')} > "${list}"`, { shell: '/bin/bash' });
sh(`ffmpeg -y -v error -f concat -safe 0 -i "${list}" -c copy "${OUT}"`);
console.log(`\n🎬 ${OUT}  (${dur(OUT).toFixed(1)}s total)`);
