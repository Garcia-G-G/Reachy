// Ambient declarations for npm packages that ship no built-in types
// and have no @types/* on DefinitelyTyped.
//
// Kept narrow — declare only the surface area Reachy actually touches.
// Extend on-demand when a parser needs additional fields.

declare module 'mammoth' {
  interface MammothImageElement {
    /** Raw alt text on the embedded image; undefined when the Word
     *  document didn't set one. */
    altText?: string;
    /** Mime type the embedded blob was stored under, e.g. 'image/png'. */
    contentType?: string;
    /** Resolves to the raw bytes (Buffer in Node). */
    read: () => Promise<Buffer>;
    /** Resolves to a base64-encoded copy of the bytes. */
    readAsBase64String: () => Promise<string>;
  }

  interface MammothImagesNamespace {
    imgElement(
      handler: (image: MammothImageElement) => Promise<{ src?: string }> | { src?: string },
    ): unknown;
    inline: MammothImagesNamespace['imgElement'];
    dataUri: unknown;
  }

  interface MammothConvertOptions {
    convertImage?: unknown;
    styleMap?: string | string[];
  }

  interface MammothConvertInput {
    buffer?: Buffer;
    path?: string;
    arrayBuffer?: ArrayBuffer;
  }

  interface MammothConvertResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  const mammoth: {
    convertToHtml(
      input: MammothConvertInput,
      options?: MammothConvertOptions,
    ): Promise<MammothConvertResult>;
    extractRawText(input: MammothConvertInput): Promise<MammothConvertResult>;
    images: MammothImagesNamespace;
  };

  export default mammoth;
}

declare module 'gray-matter' {
  interface GrayMatterFile<T = Record<string, unknown>> {
    data: T;
    content: string;
    excerpt?: string;
    orig: Buffer | string;
    language?: string;
    matter?: string;
    stringify(lang?: string): string;
  }
  function matter<T = Record<string, unknown>>(
    input: string | Buffer,
    options?: Record<string, unknown>,
  ): GrayMatterFile<T>;
  export default matter;
}
