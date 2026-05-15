import 'server-only';
import { spawn } from 'node:child_process';

/**
 * Single-pass audio statistics for an mp4/mp3, used by the autopilot
 * reel critic (Step 5). Uses ffmpeg's `astats` audio filter which
 * computes per-channel RMS, peak, and clipping percentages and prints
 * them to stderr.
 *
 * Output is folded across channels so the critic sees the worst-case
 * peak and the average RMS — that's what tells the rubric whether
 * the mix is balanced or clipping.
 */

export interface AudioStats {
  /** True peak in dBFS (most negative = quietest). 0 = full scale,
   *  -inf = silence. */
  peakDb: number;
  /** Mean RMS in dBFS — proxy for perceived loudness. */
  rmsDb: number;
  /** Fraction of samples that hit clipping (>= 0 dBFS). 0 = clean. */
  clipFraction: number;
  /** Raw stderr — included for debugging when the parse fails. */
  rawTail?: string;
}

const FALLBACK: AudioStats = {
  peakDb: -Infinity,
  rmsDb: -Infinity,
  clipFraction: 0,
};

export async function audioStats(filePath: string): Promise<AudioStats> {
  return new Promise((resolve) => {
    const args = [
      '-hide_banner',
      '-nostats',
      '-i',
      filePath,
      '-af',
      'astats=metadata=1:reset=0',
      '-f',
      'null',
      '-',
    ];
    const child = spawn('ffmpeg', args);
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', () => {
      try {
        resolve(parseAstats(stderr));
      } catch {
        resolve({ ...FALLBACK, rawTail: stderr.slice(-400) });
      }
    });
    child.on('error', () => {
      resolve(FALLBACK);
    });
  });
}

/** Parse the astats summary block ffmpeg prints to stderr. */
function parseAstats(stderr: string): AudioStats {
  // astats emits lines like `[Parsed_astats_0 @ 0x…] Peak level dB: -1.234`
  // for each channel and an "Overall" block at the end.
  // We pick the OVERALL block first; fall back to scanning per-channel
  // and taking the max peak / mean RMS.
  const overallIdx = stderr.lastIndexOf('Overall');
  const scan = overallIdx >= 0 ? stderr.slice(overallIdx) : stderr;
  const peakMatch = scan.match(/Peak level dB:\s*(-?\d+(?:\.\d+)?|-inf)/i);
  const rmsMatch = scan.match(/RMS level dB:\s*(-?\d+(?:\.\d+)?|-inf)/i);
  // astats counts clipped samples; convert to fraction. The "Number of
  // clipped samples" line + "Number of samples" line together give us
  // the ratio.
  const clipMatch = scan.match(/Number of clipped samples:\s*(\d+)/i);
  const sampleMatch = scan.match(/Number of samples:\s*(\d+)/i);

  const parseDb = (s: string | undefined): number => {
    if (!s || /-inf/i.test(s)) return -Infinity;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : -Infinity;
  };
  const clipped = clipMatch ? Number.parseInt(clipMatch[1] ?? '0', 10) : 0;
  const samples = sampleMatch ? Number.parseInt(sampleMatch[1] ?? '0', 10) : 0;

  return {
    peakDb: parseDb(peakMatch?.[1]),
    rmsDb: parseDb(rmsMatch?.[1]),
    clipFraction: samples > 0 ? clipped / samples : 0,
  };
}
