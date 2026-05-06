import 'server-only';
import type { CopyFormat } from '@/lib/copy-formats';

// Strict-mode JSON Schemas for OpenAI Structured Outputs (May 2026).
// Hard rules: every object lists every property in `required` and sets
// `additionalProperties: false`. Without these the API rejects the call.
// See: developers.openai.com/api/docs/guides/structured-outputs

type JsonSchema = Record<string, unknown>;

function bilingualObject(esSchema: JsonSchema, enSchema: JsonSchema): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['es', 'en'],
    properties: { es: esSchema, en: enSchema },
  };
}

const tweetSide: JsonSchema = { type: 'string' };

const threadSide: JsonSchema = {
  type: 'array',
  items: { type: 'string' },
  minItems: 5,
  maxItems: 7,
};

const linkedinSide: JsonSchema = { type: 'string' };

const igCaptionSide: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['caption', 'hashtags'],
  properties: {
    caption: { type: 'string' },
    hashtags: {
      type: 'array',
      items: { type: 'string' },
      minItems: 5,
      maxItems: 5,
    },
  },
};

const emailSubjectSide: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'preview'],
  properties: {
    subject: { type: 'string' },
    preview: { type: 'string' },
  },
};

const emailBodySide: JsonSchema = { type: 'string' };

const headlineSide: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'sub'],
  properties: {
    headline: { type: 'string' },
    sub: { type: 'string' },
  },
};

const featuresSide: JsonSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'body'],
    properties: {
      title: { type: 'string' },
      body: { type: 'string' },
    },
  },
  minItems: 3,
  maxItems: 3,
};

const howItWorksSide: JsonSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['step', 'title', 'body'],
    properties: {
      step: { type: 'integer', minimum: 1, maximum: 9 },
      title: { type: 'string' },
      body: { type: 'string' },
    },
  },
  minItems: 3,
  maxItems: 3,
};

export const copySchemas: Record<CopyFormat, JsonSchema> = {
  tweet: bilingualObject(tweetSide, tweetSide),
  thread: bilingualObject(threadSide, threadSide),
  linkedin: bilingualObject(linkedinSide, linkedinSide),
  'ig-caption': bilingualObject(igCaptionSide, igCaptionSide),
  'email-subject': bilingualObject(emailSubjectSide, emailSubjectSide),
  'email-body': bilingualObject(emailBodySide, emailBodySide),
  headline: bilingualObject(headlineSide, headlineSide),
  features: bilingualObject(featuresSide, featuresSide),
  'how-it-works': bilingualObject(howItWorksSide, howItWorksSide),
};

/** Schema name passed to OpenAI; must match `^[a-zA-Z0-9_-]+$`. */
export function schemaNameFor(format: CopyFormat): string {
  return `copy_${format.replace(/-/g, '_')}`;
}
