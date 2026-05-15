import 'server-only';

/**
 * Per-parser caps that bound the ingestion bundle so a single bad upload
 * (a 500MB log file, a 5000-image zip) cannot blow up R2 spend, worker
 * memory, or Postgres jsonb storage.
 *
 * Cannot be derived: these are policy limits we'd want consistent across
 * worker / action / UI, not facts the runtime can compute. The action's
 * client-side upload validator MUST also enforce these (the worker's job
 * is the second line of defense after the network).
 *
 * Tighten cautiously — Garcia ingests a mix of docs + repos + decks; the
 * caps below give comfortable headroom for a real brand-brief upload
 * while keeping outliers cheap to reject.
 */

/** Max bytes for a SINGLE file in an ingestion. Hard cap because the
 *  parser routes through a Node Buffer in memory; anything above this
 *  risks OOM in the BullMQ worker pod. */
export const MAX_BYTES_PER_FILE = 25 * 1024 * 1024; // 25 MB

/** Max bytes for the WHOLE ingestion (sum of all files). Compounds the
 *  per-file cap when many small files arrive. */
export const MAX_BYTES_PER_INGESTION = 100 * 1024 * 1024; // 100 MB

/** Max number of files in a single ingestion. Caps recursion depth too —
 *  zips that expand past this fail. */
export const MAX_FILES_PER_INGESTION = 250;

/** Max characters extracted PER text-yielding parser. Documents that
 *  exceed this get truncated at the boundary with a "[truncated]"
 *  marker on the last block. Prevents one massive PDF from saturating
 *  the planner LLM in Step 2. */
export const MAX_TEXT_CHARS_PER_FILE = 200_000;

/** Max number of images extracted PER parser. Bigger decks / docs
 *  routinely embed icons + logos that we'd never use; we keep the
 *  first N and drop the rest. */
export const MAX_IMAGES_PER_FILE = 40;

/** Max keyframes the mp4 parser pulls. The brief says 6-8; 8 is the
 *  upper bound. More keyframes does not improve downstream vision-
 *  caption quality (Step 2) but does cost real R2 storage. */
export const MAX_KEYFRAMES_PER_VIDEO = 8;

/** Max source files the repo parser ingests (after the README +
 *  manifest). Beyond ~5 the signal-to-noise tanks — the planner is
 *  trying to read a brand brief out of code, not understand the
 *  entire architecture. */
export const MAX_REPO_SOURCE_FILES = 5;

/** Max lines of code per source file in the repo parser. Past this the
 *  file's `topComments` + `symbols` are still extracted but the body
 *  text is dropped. */
export const MAX_REPO_LOC_PER_FILE = 200;

/** Hash-prefix length used for cross-file dedup. The aggregator hashes
 *  textBlock content with SHA-256 and uses the first N hex chars as
 *  the dedup key. Long enough to avoid collisions across an ingestion;
 *  short enough to keep the key cheap. */
export const DEDUP_HASH_PREFIX_LEN = 16;
